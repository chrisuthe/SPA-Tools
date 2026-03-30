import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import type { DTC, ModuleStatus } from '../types';
import Modal from '../components/Modal';
import Toast from '../components/Toast';

interface ModuleGroup {
  name: string;
  fullName: string;
  dtcs: DTC[];
}

interface ToastState {
  message: string;
  type: 'success' | 'error';
}

export default function Dtcs() {
  const [searchParams] = useSearchParams();
  const [dtcs, setDtcs] = useState<DTC[]>([]);
  const [modules, setModules] = useState<ModuleStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [showAllModules, setShowAllModules] = useState(false);
  const [clearTarget, setClearTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [clearing, setClearing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const initialScrollDone = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await api.status();
      setConnected(status.connected);
      if (!status.connected) {
        setDtcs([]);
        setModules([]);
        setLoading(false);
        return;
      }
      const [dtcData, moduleData] = await Promise.all([
        api.dtcReadAll(),
        api.modules(),
      ]);
      setDtcs(dtcData);
      setModules(moduleData);

      // Expand groups that have DTCs
      const modulesWithDtcs = new Set(dtcData.map((d) => d.module));
      setExpandedGroups(modulesWithDtcs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch DTCs');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build module groups
  const groups: ModuleGroup[] = useMemo(() => {
    const dtcByModule = new Map<string, DTC[]>();
    for (const dtc of dtcs) {
      const list = dtcByModule.get(dtc.module) || [];
      list.push(dtc);
      dtcByModule.set(dtc.module, list);
    }

    const result: ModuleGroup[] = [];
    const seen = new Set<string>();

    // First: modules with DTCs (sorted by name)
    for (const [mod, modDtcs] of [...dtcByModule.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      const info = modules.find((m) => m.name === mod);
      result.push({
        name: mod,
        fullName: info?.full_name || mod,
        dtcs: modDtcs,
      });
      seen.add(mod);
    }

    // Then: all other modules (if showAllModules)
    if (showAllModules) {
      for (const mod of [...modules].sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        if (!seen.has(mod.name)) {
          result.push({
            name: mod.name,
            fullName: mod.full_name,
            dtcs: [],
          });
        }
      }
    }

    return result;
  }, [dtcs, modules, showAllModules]);

  // Auto-scroll to ?module= param on first load
  useEffect(() => {
    if (initialScrollDone.current || loading) return;
    const targetModule = searchParams.get('module');
    if (targetModule && groups.length > 0) {
      initialScrollDone.current = true;
      // Ensure group is shown (might be a clean module)
      const hasGroup = groups.some((g) => g.name === targetModule);
      if (!hasGroup) {
        setShowAllModules(true);
      }
      // Expand it
      setExpandedGroups((prev) => new Set([...prev, targetModule]));
      // Scroll after render
      requestAnimationFrame(() => {
        groupRefs.current[targetModule]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    } else if (groups.length > 0) {
      initialScrollDone.current = true;
    }
  }, [groups, loading, searchParams]);

  const activeDtcCount = dtcs.length;

  const toggleGroup = (mod: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod);
      else next.add(mod);
      return next;
    });
  };

  const handleClearConfirm = async () => {
    if (!clearTarget) return;
    const mod = clearTarget;
    setClearTarget(null);
    setClearing(true);
    try {
      await api.dtcClear(mod);
      setToast({ message: `DTCs cleared from ${mod}`, type: 'success' });
      await fetchData();
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : `Failed to clear DTCs from ${mod}`,
        type: 'error',
      });
    } finally {
      setClearing(false);
    }
  };

  // Disconnected state
  if (connected === false && !loading) {
    return (
      <div style={styles.view}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <h2 style={styles.title}>Diagnostic Trouble Codes</h2>
          </div>
        </div>
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>&#x26A0;</span>
          <p style={styles.emptyText}>Connect to vehicle to read DTCs</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.view}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>Diagnostic Trouble Codes</h2>
          {activeDtcCount > 0 && (
            <span style={styles.countBadge}>{activeDtcCount}</span>
          )}
        </div>
        <button
          style={styles.refreshBtn}
          onClick={fetchData}
          disabled={loading}
        >
          {loading ? 'Scanning\u2026' : '\u21BB Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBar}>{error}</div>}

      {/* Controls */}
      {!loading && connected && (
        <div style={styles.controls}>
          <label style={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={showAllModules}
              onChange={(e) => setShowAllModules(e.target.checked)}
              style={styles.checkbox}
            />
            Show all modules
          </label>
        </div>
      )}

      {/* Empty / clean state */}
      {!loading && connected && groups.length === 0 && (
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>&#x2713;</span>
          <p style={styles.emptyText}>
            No DTCs found &mdash; vehicle is clean
          </p>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>Scanning modules\u2026</p>
        </div>
      )}

      {/* Module groups */}
      {!loading &&
        groups.map((group) => {
          const expanded = expandedGroups.has(group.name);
          const hasDtcs = group.dtcs.length > 0;

          return (
            <div
              key={group.name}
              ref={(el) => { groupRefs.current[group.name] = el; }}
              style={styles.moduleGroup}
            >
              {/* Group header */}
              <div
                style={{
                  ...styles.groupHeader,
                  ...(hasDtcs ? styles.groupHeaderActive : {}),
                }}
                onClick={() => toggleGroup(group.name)}
              >
                <span style={styles.arrow}>
                  {expanded ? '\u25BE' : '\u25B8'}
                </span>
                <span style={styles.moduleName}>{group.name}</span>
                <span style={styles.moduleFullName}>{group.fullName}</span>
                {hasDtcs && (
                  <span style={styles.dtcBadge}>{group.dtcs.length}</span>
                )}
                {!hasDtcs && (
                  <span style={styles.cleanLabel}>No codes</span>
                )}
                {hasDtcs && (
                  <button
                    style={styles.clearBtn}
                    disabled={clearing}
                    onClick={(e) => {
                      e.stopPropagation();
                      setClearTarget(group.name);
                    }}
                  >
                    Clear &times;
                  </button>
                )}
              </div>

              {/* DTC rows */}
              {expanded && hasDtcs && (
                <div style={styles.dtcList}>
                  {group.dtcs.map((dtc, i) => (
                    <div key={`${dtc.code}-${i}`} style={styles.dtcRow}>
                      <span style={styles.dtcCode}>{dtc.display}</span>
                      <span style={styles.dtcDesc}>{dtc.description}</span>
                      <span style={styles.dtcStatus}>
                        0x{dtc.status.toString(16).toUpperCase().padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {expanded && !hasDtcs && (
                <div style={styles.dtcList}>
                  <div style={styles.noCodes}>No codes stored</div>
                </div>
              )}
            </div>
          );
        })}

      {/* Clear confirmation modal */}
      <Modal
        open={clearTarget !== null}
        title={`Clear DTCs from ${clearTarget || ''}?`}
        message="Clear all DTCs from this module? This requires an extended diagnostic session."
        confirmLabel="Clear"
        onConfirm={handleClearConfirm}
        onCancel={() => setClearTarget(null)}
      />

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  view: {
    maxWidth: 860,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--sp-4)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  countBadge: {
    background: 'var(--status-warn)',
    color: '#1a1a1a',
    fontSize: 12,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    fontVariantNumeric: 'tabular-nums',
  },
  refreshBtn: {
    padding: '6px 14px',
    fontSize: 13,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--accent)',
    background: 'transparent',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontWeight: 500,
  },
  errorBar: {
    background: 'rgba(255, 82, 82, 0.12)',
    border: '1px solid var(--status-error)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--status-error)',
    marginBottom: 'var(--sp-4)',
  },
  controls: {
    marginBottom: 'var(--sp-4)',
  },
  toggleLabel: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
  },
  checkbox: {
    accentColor: 'var(--accent)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 0',
    gap: 'var(--sp-3)',
  },
  emptyIcon: {
    fontSize: 32,
    color: 'var(--text-disabled)',
  },
  emptyText: {
    fontSize: 14,
    color: 'var(--text-tertiary)',
    margin: 0,
  },
  moduleGroup: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--sp-2)',
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-2)',
    padding: '10px 14px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    transition: 'background 0.15s',
  },
  groupHeaderActive: {
    borderLeft: '3px solid var(--status-warn)',
  },
  arrow: {
    fontSize: 12,
    color: 'var(--text-tertiary)',
    width: 14,
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  moduleName: {
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--text-primary)',
  },
  moduleFullName: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    flex: 1,
  },
  dtcBadge: {
    background: 'var(--status-warn)',
    color: '#1a1a1a',
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 7px',
    borderRadius: 'var(--radius-sm)',
    fontVariantNumeric: 'tabular-nums',
  },
  cleanLabel: {
    fontSize: 12,
    color: 'var(--text-disabled)',
    fontStyle: 'italic',
  },
  clearBtn: {
    marginLeft: 'var(--sp-2)',
    padding: '3px 10px',
    fontSize: 12,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--status-error)',
    background: 'transparent',
    color: 'var(--status-error)',
    cursor: 'pointer',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  dtcList: {
    borderTop: '1px solid var(--bg-recessed)',
    padding: '4px 0',
  },
  dtcRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-4)',
    padding: '6px 14px 6px 34px',
    fontSize: 13,
  },
  dtcCode: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    color: 'var(--accent-light)',
    minWidth: 72,
    flexShrink: 0,
  },
  dtcDesc: {
    color: 'var(--text-primary)',
    flex: 1,
  },
  dtcStatus: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--text-tertiary)',
    flexShrink: 0,
  },
  noCodes: {
    padding: '8px 14px 8px 34px',
    fontSize: 13,
    color: 'var(--text-disabled)',
    fontStyle: 'italic',
  },
};
