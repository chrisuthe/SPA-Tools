import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}

export default function Toast({ message, type, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const borderColor = type === 'success' ? 'var(--status-ok)' : 'var(--status-error)';

  return (
    <div style={{ ...styles.container, borderLeft: `3px solid ${borderColor}` }}>
      <span style={styles.icon}>{type === 'success' ? '\u2713' : '\u2717'}</span>
      <span style={styles.message}>{message}</span>
      <button style={styles.dismiss} onClick={onDismiss}>
        \u00d7
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 16,
    right: 16,
    zIndex: 1100,
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
    maxWidth: 360,
    animation: 'toast-in 0.25s ease-out',
  },
  icon: {
    fontSize: 14,
    flexShrink: 0,
  },
  message: {
    fontSize: 13,
    color: 'var(--text-primary)',
    flex: 1,
  },
  dismiss: {
    background: 'none',
    border: 'none',
    color: 'var(--text-tertiary)',
    cursor: 'pointer',
    fontSize: 16,
    padding: '0 0 0 8px',
    lineHeight: 1,
  },
};
