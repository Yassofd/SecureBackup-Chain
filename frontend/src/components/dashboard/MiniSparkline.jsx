import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export default function MiniSparkline({ data = [], color, height = 40 }) {
  const { chart } = useTheme();
  const stroke = color || chart.brand;
  const points = data.map((v, i) => ({ v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={1.5}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
