import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import type { ConfigParam } from '../types';

const MODULES = ['CEM', 'ECM', 'IHU'] as const;

/* ------------------------------------------------------------------ */
/*  Inline Modal                                                       */
/* ------------------------------------------------------------------ */
function Modal({
  open,
  title,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>{title}</h3>
        <div style={{ margin: '12px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
          {children}
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button style={styles.btnSecondary} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.btnPrimary} onClick={onConfirm}>
            Confirm Write
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline Toast                                                       */
/* ------------------------------------------------------------------ */
function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        padding: '10px 20px',
        borderRadius: 'var(--radius-md)',
        fontSize: '13px',
        fontWeight: 500,
        color: '#fff',
        background: type === 'success' ? 'var(--status-ok)' : 'var(--status-error)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        zIndex: 9999,
        cursor: 'pointer',
      }}
      onClick={onClose}
    >
      {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editable Cell                                                      */
/* ------------------------------------------------------------------ */
function EditableCell({
  param,
  editValue,
  onChange,
  onSave,
}: {
  param: ConfigParam;
  editValue: boolean | number;
  onChange: (v: boolean | number) => void;
  onSave: () => void;
}) {
  const isBool = typeof param.value === 'boolean';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {isBool ? (
        <select
          value={editValue ? 'true' : 'false'}
          onChange={(e) => onChange(e.target.value === 'true')}
          style={styles.input}
        >
          <option value="true">ON</option>
          <option value="false">OFF</option>
        </select>
      ) : (
        <input
          type="number"
          value={editValue as number}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ...styles.input, width: '100px' }}
        />
      )}
      <button style={styles.btnSave} onClick={onSave}>
        Save
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Config View                                                        */
/* ------------------------------------------------------------------ */
export default function Config() {
  const [activeModule, setActiveModule] = useState<string>(MODULES[0]);
  const [params, setParams] = useState<ConfigParam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editModeLoading, setEditModeLoading] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, boolean | number>>({});

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingWrite, setPendingWrite] = useState<{
    param: string;
    value: boolean | number;
    did: number;
  } | null>(null);
  const [writeLoading, setWriteLoading] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  /* ---- Fetch config for active module ---- */
  const fetchConfig = useCallback(
    (mod: string) => {
      setLoading(true);
      setError(null);
      api
        .configRead(mod)
        .then((data) => {
          setParams(data);
          // Initialize edit values
          const vals: Record<string, boolean | number> = {};
          data.forEach((p) => {
            vals[p.param] = p.value;
          });
          setEditValues(vals);
        })
        .catch((err) => setError(err.message || 'Failed to load configuration'))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    fetchConfig(activeModule);
  }, [activeModule, fetchConfig]);

  /* ---- Tab switch ---- */
  const handleTabClick = (mod: string) => {
    setActiveModule(mod);
    // Reset edit mode when switching modules
    if (editMode) {
      api.exitEditMode().catch(() => {});
      setEditMode(false);
    }
  };

  /* ---- Enter / exit edit mode ---- */
  const handleEnterEditMode = async () => {
    setEditModeLoading(true);
    try {
      await api.enterEditMode();
      setEditMode(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to enter edit mode';
      setToast({ message: msg, type: 'error' });
    } finally {
      setEditModeLoading(false);
    }
  };

  const handleExitEditMode = async () => {
    setEditModeLoading(true);
    try {
      await api.exitEditMode();
    } catch {
      // best effort
    } finally {
      setEditMode(false);
      setEditModeLoading(false);
      fetchConfig(activeModule);
    }
  };

  /* ---- Edit value change ---- */
  const handleEditChange = (param: string, value: boolean | number) => {
    setEditValues((prev) => ({ ...prev, [param]: value }));
  };

  /* ---- Save flow ---- */
  const handleSaveClick = (param: ConfigParam) => {
    setPendingWrite({
      param: param.param,
      value: editValues[param.param],
      did: param.did,
    });
    setModalOpen(true);
  };

  const handleConfirmWrite = async () => {
    if (!pendingWrite) return;
    setWriteLoading(true);
    try {
      await api.configWrite(activeModule, pendingWrite.param, pendingWrite.value);
      setToast({ message: `Successfully wrote ${pendingWrite.param}`, type: 'success' });
      // Refresh to show updated value
      fetchConfig(activeModule);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Write failed';
      setToast({ message: msg, type: 'error' });
    } finally {
      setWriteLoading(false);
      setModalOpen(false);
      setPendingWrite(null);
    }
  };

  const handleCancelWrite = () => {
    setModalOpen(false);
    setPendingWrite(null);
  };

  /* ---- Determine badge type ---- */
  const badgeType = (p: ConfigParam): 'bool' | 'number' | 'enum' => {
    if (typeof p.value === 'boolean') return 'bool';
    return 'number';
  };

  /* ---- Format DID as hex ---- */
  const formatDid = (did: number) => '0x' + did.toString(16).toUpperCase().padStart(4, '0');

  return (
    <div className="view">
      {/* Edit mode amber banner */}
      {editMode && (
        <div style={styles.editBanner}>
          Edit Mode Active — changes will be written directly to the {activeModule} module
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Configuration</h2>
          <span
            style={{
              ...styles.modeBadge,
              background: editMode ? 'rgba(255, 167, 38, 0.15)' : 'rgba(91, 155, 213, 0.1)',
              color: editMode ? 'var(--status-warn)' : 'var(--text-secondary)',
              borderColor: editMode ? 'rgba(255, 167, 38, 0.3)' : 'rgba(91, 155, 213, 0.2)',
            }}
          >
            {editMode ? 'Edit Mode' : 'Read Only'}
          </span>
        </div>
        <button
          style={editMode ? styles.btnExitEdit : styles.btnEnterEdit}
          onClick={editMode ? handleExitEditMode : handleEnterEditMode}
          disabled={editModeLoading}
        >
          {editModeLoading
            ? 'Switching...'
            : editMode
              ? '\uD83D\uDD13 Exit Edit Mode'
              : '\uD83D\uDD12 Enter Edit Mode'}
        </button>
      </div>

      {/* Module tabs */}
      <div style={styles.tabs}>
        {MODULES.map((mod) => (
          <button
            key={mod}
            style={mod === activeModule ? styles.tabActive : styles.tab}
            onClick={() => handleTabClick(mod)}
          >
            {mod}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={styles.emptyState}>
          <span style={{ color: 'var(--text-tertiary)' }}>Loading configuration...</span>
        </div>
      ) : error ? (
        <div style={styles.emptyState}>
          <span style={{ color: 'var(--status-error)' }}>{error}</span>
          <button
            style={{ ...styles.btnSecondary, marginTop: '12px' }}
            onClick={() => fetchConfig(activeModule)}
          >
            Retry
          </button>
        </div>
      ) : params.length === 0 ? (
        <div style={styles.emptyState}>
          <span style={{ color: 'var(--text-tertiary)' }}>
            No configuration parameters found for {activeModule}.
          </span>
          <span style={{ color: 'var(--text-disabled)', fontSize: '12px', marginTop: '4px' }}>
            Ensure the vehicle is connected and the module is responding.
          </span>
        </div>
      ) : (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Parameter</th>
                <th style={styles.th}>Value</th>
                <th style={styles.th}>Unit</th>
                <th style={{ ...styles.th, fontFamily: 'var(--font-mono)' }}>DID</th>
                {editMode && <th style={styles.th}></th>}
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.param} style={styles.tr}>
                  <td style={styles.td}>{p.param}</td>
                  <td style={styles.td}>
                    {editMode ? (
                      <EditableCell
                        param={p}
                        editValue={editValues[p.param]}
                        onChange={(v) => handleEditChange(p.param, v)}
                        onSave={() => handleSaveClick(p)}
                      />
                    ) : (
                      <StatusBadge value={p.value} type={badgeType(p)} />
                    )}
                  </td>
                  <td style={{ ...styles.td, color: 'var(--text-tertiary)' }}>{p.unit}</td>
                  <td
                    style={{
                      ...styles.td,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-tertiary)',
                      fontSize: '12px',
                    }}
                  >
                    {formatDid(p.did)}
                  </td>
                  {editMode && <td style={styles.td}></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation modal */}
      <Modal
        open={modalOpen}
        title="Confirm Configuration Write"
        onConfirm={handleConfirmWrite}
        onCancel={handleCancelWrite}
      >
        {pendingWrite && (
          <p style={{ margin: 0 }}>
            Write{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{pendingWrite.param}</strong>
            {' = '}
            <strong style={{ color: 'var(--accent-light)' }}>
              {typeof pendingWrite.value === 'boolean'
                ? pendingWrite.value
                  ? 'ON'
                  : 'OFF'
                : String(pendingWrite.value)}
            </strong>{' '}
            to <strong style={{ color: 'var(--text-primary)' }}>{activeModule}</strong> via DID{' '}
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg-recessed)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {formatDid(pendingWrite.did)}
            </code>
            ?
          </p>
        )}
        {writeLoading && (
          <p style={{ marginTop: '8px', color: 'var(--status-warn)', fontSize: '12px' }}>
            Writing...
          </p>
        )}
      </Modal>

      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles (inline, using CSS variables from theme.css)                */
/* ------------------------------------------------------------------ */
const styles: Record<string, React.CSSProperties> = {
  /* Edit mode banner */
  editBanner: {
    background: 'rgba(255, 167, 38, 0.1)',
    border: '1px solid rgba(255, 167, 38, 0.25)',
    color: 'var(--status-warn)',
    padding: '8px 16px',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '16px',
  },

  /* Header */
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },

  modeBadge: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    border: '1px solid',
  },

  /* Buttons */
  btnEnterEdit: {
    background: 'rgba(91, 155, 213, 0.12)',
    color: 'var(--accent)',
    border: '1px solid rgba(91, 155, 213, 0.3)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'background 0.15s',
  },

  btnExitEdit: {
    background: 'rgba(255, 167, 38, 0.12)',
    color: 'var(--status-warn)',
    border: '1px solid rgba(255, 167, 38, 0.3)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'background 0.15s',
  },

  btnPrimary: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },

  btnSecondary: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid var(--text-disabled)',
    borderRadius: 'var(--radius-sm)',
    padding: '6px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },

  btnSave: {
    background: 'rgba(91, 155, 213, 0.12)',
    color: 'var(--accent)',
    border: '1px solid rgba(91, 155, 213, 0.25)',
    borderRadius: 'var(--radius-sm)',
    padding: '3px 12px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    whiteSpace: 'nowrap',
  },

  /* Tabs */
  tabs: {
    display: 'flex',
    gap: '2px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--bg-recessed)',
    paddingBottom: '0',
  },

  tab: {
    background: 'transparent',
    color: 'var(--text-tertiary)',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'color 0.15s',
  },

  tabActive: {
    background: 'transparent',
    color: 'var(--accent)',
    border: 'none',
    borderBottom: '2px solid var(--accent)',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },

  /* Table */
  tableWrapper: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-recessed)',
    overflow: 'hidden',
  },

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },

  th: {
    textAlign: 'left' as const,
    padding: '10px 16px',
    color: 'var(--text-tertiary)',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    borderBottom: '1px solid var(--bg-recessed)',
    background: 'var(--bg-recessed)',
  },

  tr: {
    borderBottom: '1px solid rgba(26, 37, 51, 0.5)',
  },

  td: {
    padding: '10px 16px',
    verticalAlign: 'middle' as const,
  },

  /* Input for edit mode */
  input: {
    background: 'var(--bg-recessed)',
    color: 'var(--text-primary)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 8px',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
    fontVariantNumeric: 'tabular-nums',
    outline: 'none',
    width: '80px',
  },

  /* Empty / loading state */
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    textAlign: 'center' as const,
    fontSize: '14px',
  },

  /* Modal overlay */
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
  },

  modal: {
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-recessed)',
    borderRadius: 'var(--radius-md)',
    padding: '24px',
    maxWidth: '440px',
    width: '90%',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
};
