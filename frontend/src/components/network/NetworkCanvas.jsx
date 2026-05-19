import { useRef, useEffect, useState, useCallback } from 'react';

/**
 * Canvas network renderer — port de chainbackup-nexus/NetworkCanvas.tsx
 * Accepte `nodes` (tableau de nœuds adaptés) au lieu du tableau statique.
 */
export function NetworkCanvas({ nodes, onNodeClick, onNodeHover, selectedNodeId }) {
  const canvasRef    = useRef(null);
  const animRef      = useRef(0);
  const positionsRef = useRef([]);
  const offsetRef    = useRef({ x: 0, y: 0 });
  const scaleRef     = useRef(1);
  const dragRef      = useRef({ dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 });
  const timeRef      = useRef(0);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const nodesRef     = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  /* Layout en cercle */
  const layoutNodes = useCallback((w, h, count) => {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.32;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const tx = cx + Math.cos(angle) * radius;
      const ty = cy + Math.sin(angle) * radius;
      const existing = positionsRef.current[i];
      return { x: existing?.x ?? tx, y: existing?.y ?? ty, vx: 0, vy: 0, targetX: tx, targetY: ty };
    });
  }, []);

  /* Resize observer */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = width  * dpr;
      canvas.height = height * dpr;
      setSize({ w: width, h: height });
      positionsRef.current = layoutNodes(width, height, nodesRef.current.length);
    });
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [layoutNodes]);

  /* Ré-layout quand le nombre de nœuds change */
  useEffect(() => {
    if (size.w && nodes.length !== positionsRef.current.length) {
      positionsRef.current = layoutNodes(size.w, size.h, nodes.length);
    }
  }, [nodes.length, size, layoutNodes]);

  /* Hit-test */
  const hitTest = useCallback((mx, my) => {
    const positions = positionsRef.current;
    const off = offsetRef.current;
    const scale = scaleRef.current;
    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      const sx = (p.x + off.x) * scale + size.w / 2 * (1 - scale);
      const sy = (p.y + off.y) * scale + size.h / 2 * (1 - scale);
      const nodeR = nodesRef.current[i]?.role === 'master' ? 32 : 26;
      const dx = mx - sx, dy = my - sy;
      if (dx * dx + dy * dy < nodeR * nodeR * scale * scale) return i;
    }
    return -1;
  }, [size]);

  /* Draw loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;
      const { w, h } = size;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const off = offsetRef.current;
      const scale = scaleRef.current;
      ctx.save();
      ctx.translate(w / 2 * (1 - scale), h / 2 * (1 - scale));
      ctx.scale(scale, scale);
      ctx.translate(off.x, off.y);

      const positions = positionsRef.current;
      const curNodes  = nodesRef.current;

      /* Smooth movement */
      for (const p of positions) {
        p.x += (p.targetX - p.x) * 0.08;
        p.y += (p.targetY - p.y) * 0.08;
      }

      /* Connexions full-mesh entre nœuds en ligne */
      for (let i = 0; i < curNodes.length; i++) {
        if (curNodes[i].status !== 'online') continue;
        for (let j = i + 1; j < curNodes.length; j++) {
          if (curNodes[j].status !== 'online') continue;
          const a = positions[i];
          const b = positions[j];
          if (!a || !b) continue;

          ctx.strokeStyle = `rgba(0, 180, 216, ${0.12 + Math.sin(t * 2 + i + j) * 0.05})`;
          ctx.shadowColor = 'rgba(0, 180, 216, 0.25)';
          ctx.shadowBlur  = 4;
          ctx.lineWidth   = 1;
          ctx.setLineDash([4, 6]);
          ctx.lineDashOffset = -(t * 30);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;

          /* Paquet de données animé */
          const pt = ((t * 0.5 + i * 0.3 + j * 0.7) % 1);
          const px = a.x + (b.x - a.x) * pt;
          const py = a.y + (b.y - a.y) * pt;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 180, 216, 0.55)';
          ctx.fill();
        }
      }

      /* Nœuds */
      for (let i = 0; i < curNodes.length; i++) {
        const node = curNodes[i];
        const p    = positions[i];
        if (!p) continue;
        const isSelected = node.id === selectedNodeId;
        const isMaster   = node.role === 'master';
        const isOnline   = node.status === 'online';
        const isSyncing  = node.status === 'syncing';
        const nodeR      = isMaster ? 32 : 26;

        /* Halo maître */
        if (isMaster && isOnline) {
          const glowA = 0.3 + Math.sin(t * 3) * 0.15;
          ctx.beginPath();
          ctx.arc(p.x, p.y, nodeR + 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(139, 92, 246, ${glowA})`;
          ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
          ctx.shadowBlur  = 16;
          ctx.lineWidth   = 2;
          ctx.stroke();
          ctx.shadowBlur  = 0;
        }

        /* Ring de sélection */
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, nodeR + 5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 180, 216, 0.9)';
          ctx.lineWidth   = 2;
          ctx.stroke();
        }

        /* Corps */
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
        if (!isOnline && !isSyncing) {
          ctx.fillStyle = 'rgba(40, 40, 60, 0.85)';
        } else if (isMaster) {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, nodeR);
          grad.addColorStop(0, 'rgba(109, 82, 206, 0.9)');
          grad.addColorStop(1, 'rgba(60, 40, 160, 0.75)');
          ctx.fillStyle = grad;
        } else if (isSyncing) {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, nodeR);
          grad.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
          grad.addColorStop(1, 'rgba(20, 20, 48, 0.85)');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = 'rgba(25, 30, 55, 0.9)';
        }

        if (isOnline || isSyncing) {
          ctx.shadowColor = isMaster ? 'rgba(139, 92, 246, 0.35)' : 'rgba(0, 180, 216, 0.2)';
          ctx.shadowBlur  = 10;
        }
        ctx.fill();
        ctx.shadowBlur = 0;

        /* Bordure */
        ctx.beginPath();
        ctx.arc(p.x, p.y, nodeR, 0, Math.PI * 2);
        if (!isOnline && !isSyncing) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        } else if (isSyncing) {
          ctx.strokeStyle = `rgba(245, 158, 11, ${0.5 + Math.sin(t * 4) * 0.3})`;
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        }
        ctx.lineWidth = 1.5;
        ctx.stroke();

        /* Point de statut */
        const dotX = p.x + nodeR * 0.62;
        const dotY = p.y - nodeR * 0.62;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = isOnline ? '#22c55e' : isSyncing ? '#f59e0b' : '#ef4444';
        ctx.fill();
        if (isOnline) {
          const pulse = 4 + Math.sin(t * 4) * 2;
          ctx.beginPath();
          ctx.arc(dotX, dotY, pulse, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.3 + Math.sin(t * 4) * 0.15})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        /* Icône */
        ctx.font       = `${isMaster ? 14 : 11}px Inter, system-ui, sans-serif`;
        ctx.textAlign  = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle  = isMaster ? 'rgba(255,255,255,0.95)' : 'rgba(180, 210, 255, 0.85)';
        ctx.fillText(isMaster ? '♛' : '●', p.x, p.y - 2);

        /* Label */
        ctx.font      = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(180, 200, 230, 0.8)';
        ctx.fillText(node.label, p.x, p.y + nodeR + 14);

        /* Mini barres CPU / RAM */
        if (isOnline && (node.cpu > 0 || node.ram > 0)) {
          const bW = 24, bH = 3;
          const bX = p.x - bW / 2;
          const bY = p.y + 8;
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(bX, bY, bW, bH);
          ctx.fillStyle = node.cpu > 80 ? '#ef4444' : node.cpu > 60 ? '#f59e0b' : '#22c55e';
          ctx.fillRect(bX, bY, bW * (node.cpu / 100), bH);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(bX, bY + 5, bW, bH);
          ctx.fillStyle = '#8b5cf6';
          ctx.fillRect(bX, bY + 5, bW * (node.ram / 100), bH);
        }
      }

      ctx.restore();
      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [size, selectedNodeId]);

  /* Handlers souris */
  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTest(mx, my);
    if (hit >= 0) {
      onNodeClick(nodesRef.current[hit]);
    } else {
      dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOffX: offsetRef.current.x, startOffY: offsetRef.current.y };
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (dragRef.current.dragging) {
      const dx = (e.clientX - dragRef.current.startX) / scaleRef.current;
      const dy = (e.clientY - dragRef.current.startY) / scaleRef.current;
      offsetRef.current = { x: dragRef.current.startOffX + dx, y: dragRef.current.startOffY + dy };
      return;
    }
    const hit = hitTest(mx, my);
    if (hit >= 0) {
      canvasRef.current.style.cursor = 'pointer';
      onNodeHover(nodesRef.current[hit], e.clientX, e.clientY);
    } else {
      canvasRef.current.style.cursor = 'grab';
      onNodeHover(null, 0, 0);
    }
  };

  const handleMouseUp = () => { dragRef.current.dragging = false; };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scaleRef.current = Math.max(0.3, Math.min(3, scaleRef.current * delta));
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { dragRef.current.dragging = false; onNodeHover(null, 0, 0); }}
      onWheel={handleWheel}
    />
  );
}
