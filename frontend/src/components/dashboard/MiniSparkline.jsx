import { LineChart, Line, ResponsiveContainer } from 'recharts';

export default function MiniSparkline({ data = [], color = '#00b4d8', height = 40 }) {
  const points = data.map((v, i) => ({ v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
