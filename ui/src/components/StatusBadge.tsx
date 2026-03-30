interface StatusBadgeProps {
  value: boolean | number | string;
  type: 'bool' | 'enum' | 'number';
}

export default function StatusBadge({ value, type }: StatusBadgeProps) {
  if (type === 'bool') {
    const isOn = Boolean(value);
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.03em',
          background: isOn ? 'rgba(76, 175, 80, 0.15)' : 'rgba(106, 130, 153, 0.15)',
          color: isOn ? 'var(--status-ok)' : 'var(--text-tertiary)',
          border: `1px solid ${isOn ? 'rgba(76, 175, 80, 0.3)' : 'rgba(106, 130, 153, 0.2)'}`,
        }}
      >
        {isOn ? 'ON' : 'OFF'}
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '12px',
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
        background: 'rgba(91, 155, 213, 0.1)',
        color: 'var(--accent-light)',
        border: '1px solid rgba(91, 155, 213, 0.2)',
      }}
    >
      {String(value)}
    </span>
  );
}
