interface TimeChartProps {
  data: { time: number; value: number }[];
  label: string;
  unit: string;
  color?: string;
}

const CHART_W = 720;
const CHART_H = 200;
const PAD = { top: 24, right: 16, bottom: 32, left: 56 };
const GRID_LINES = 5;

export default function TimeChart({
  data,
  label,
  unit,
  color = 'var(--accent)',
}: TimeChartProps) {
  if (data.length < 2) {
    return (
      <div style={styles.empty}>
        <span style={{ color: 'var(--text-tertiary)' }}>
          Waiting for data...
        </span>
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rangePad = (rawMax - rawMin) * 0.1 || 1;
  const yMin = rawMin - rangePad;
  const yMax = rawMax + rangePad;
  const yRange = yMax - yMin;

  const now = data[data.length - 1].time;
  const tMin = now - 300_000; // 5 minutes ago
  const tRange = now - tMin;

  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const toX = (t: number) => PAD.left + ((t - tMin) / tRange) * plotW;
  const toY = (v: number) => PAD.top + ((yMax - v) / yRange) * plotH;

  // Build polyline points
  const linePoints = data
    .map((d) => `${toX(d.time).toFixed(1)},${toY(d.value).toFixed(1)}`)
    .join(' ');

  // Area fill path (polyline closed to bottom)
  const first = data[0];
  const last = data[data.length - 1];
  const areaPath = [
    `M ${toX(first.time).toFixed(1)},${toY(first.value).toFixed(1)}`,
    ...data
      .slice(1)
      .map(
        (d) => `L ${toX(d.time).toFixed(1)},${toY(d.value).toFixed(1)}`
      ),
    `L ${toX(last.time).toFixed(1)},${(PAD.top + plotH).toFixed(1)}`,
    `L ${toX(first.time).toFixed(1)},${(PAD.top + plotH).toFixed(1)}`,
    'Z',
  ].join(' ');

  // Horizontal grid lines
  const gridLines = Array.from({ length: GRID_LINES }, (_, i) => {
    const frac = i / (GRID_LINES - 1);
    const val = yMax - frac * yRange;
    const y = PAD.top + frac * plotH;
    return { y, label: val.toFixed(1) };
  });

  // Time axis labels
  const timeLabels: { x: number; text: string }[] = [
    { x: toX(tMin), text: '-5:00' },
    { x: toX(tMin + tRange * 0.5), text: '-2:30' },
    { x: toX(now), text: 'Now' },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <span style={styles.unit}>({unit})</span>
      </div>
      <svg
        width="100%"
        height={CHART_H}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
      >
        {/* Grid lines */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={g.y}
              x2={CHART_W - PAD.right}
              y2={g.y}
              stroke="var(--text-disabled)"
              strokeWidth={0.5}
              strokeDasharray="4,3"
            />
            <text
              x={PAD.left - 8}
              y={g.y + 3}
              textAnchor="end"
              fill="var(--text-tertiary)"
              fontSize={10}
              fontFamily="var(--font-mono)"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Time axis labels */}
        {timeLabels.map((tl, i) => (
          <text
            key={i}
            x={tl.x}
            y={CHART_H - 8}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={10}
            fontFamily="var(--font-mono)"
          >
            {tl.text}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity={0.12} />

        {/* Data line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'var(--bg-recessed)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--sp-4)',
    marginTop: 'var(--sp-4)',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--sp-2)',
    marginBottom: 'var(--sp-2)',
  },
  label: {
    color: 'var(--text-primary)',
    fontWeight: 600,
    fontSize: 14,
  },
  unit: {
    color: 'var(--text-tertiary)',
    fontSize: 12,
  },
  empty: {
    background: 'var(--bg-recessed)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--sp-8)',
    marginTop: 'var(--sp-4)',
    textAlign: 'center' as const,
  },
};
