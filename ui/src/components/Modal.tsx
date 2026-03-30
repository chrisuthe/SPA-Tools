import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}

export default function Modal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
}: ModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} onClick={onCancel}>
      <div style={styles.box} onClick={(e) => e.stopPropagation()}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.confirmBtn} ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 14, 20, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  box: {
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-recessed)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--sp-6)',
    maxWidth: 420,
    width: '90%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  title: {
    margin: 0,
    marginBottom: 'var(--sp-3)',
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  message: {
    margin: 0,
    marginBottom: 'var(--sp-6)',
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 'var(--sp-2)',
  },
  cancelBtn: {
    padding: '6px 16px',
    fontSize: 13,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--text-disabled)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  confirmBtn: {
    padding: '6px 16px',
    fontSize: 13,
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
};
