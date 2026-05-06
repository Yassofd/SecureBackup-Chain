# Phase 6 — Authentification et rôles RBAC

**Objectif** : Sécuriser l'application avec authentification JWT et trois rôles (Administrateur, Responsable, Auditeur).

**Prérequis** : Phase 5 complétée.

---

## Étapes principales

### 1. Base de données applicative

Installer PostgreSQL via Docker, créer la table `users` :
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'responsable', 'auditeur')),
  mfa_secret VARCHAR(64),
  certificate_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
```

Installer Prisma ou Knex pour la gestion : `npm install prisma @prisma/client`.

### 2. Endpoints d'authentification

- `POST /api/auth/register` (admin uniquement)
- `POST /api/auth/login` → JWT + refresh token
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/mfa/enable` et `/verify`
- `GET /api/auth/me`

### 3. Middleware

`middleware/auth.js` — vérifie le JWT, charge `req.user`.

`middleware/role.js` — `requireRole('admin')`, `requireAnyRole('admin', 'responsable')`.

### 4. Protéger les routes existantes

Toutes les routes `/api/backups/*` nécessitent un JWT valide. Filtrer par `ownerId` pour les Responsables. Les Auditeurs ont lecture seule.

### 5. Frontend

Page Login, gestion du token (localStorage + intercepteur Axios), redirection conditionnelle par rôle, page Profil avec activation MFA.

---

## Validation

- [ ] Création d'un admin via script seed
- [ ] Login retourne un JWT valide
- [ ] Un utilisateur Auditeur ne peut pas uploader (403)
- [ ] Un utilisateur Responsable ne voit que ses fichiers
- [ ] L'admin peut tout faire
- [ ] MFA fonctionne avec Google Authenticator

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 7](phase-07.md).