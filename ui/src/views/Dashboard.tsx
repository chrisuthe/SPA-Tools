import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { StatusResponse, ModuleStatus, DTC } from '../types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardData {
  status: StatusResponse | null;
  modules: ModuleStatus[];
  dtcs: DTC[];
  loading: boolean;
  error: string | null;
  lastScan: Date | null;
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-6)',
    maxWidth: 1200,
  },

  /* Header */
  header: {
    marginBottom: 'var(--sp-2)',
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 'var(--sp-1)',
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },

  /* Vehicle info bar */
  vehicleBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-6)',
    padding: 'var(--sp-3) var(--sp-4)',
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
  },
  vehicleItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  vehicleLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-tertiary)',
  },
  vehicleValue: {
    fontSize: 14,
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  vinValue: {
    fontSize: 14,
    color: 'var(--text-primary)',
    fontWeight: 500,
    fontFamily: 'var(--font-mono)',
    cursor: 'default',
  },
  sessionBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--accent-tint)',
    color: 'var(--accent)',
    textTransform: 'uppercase' as const,
  },

  /* Status cards row */
  statusRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 'var(--sp-4)',
  },
  statusCard: {
    padding: 'var(--sp-4)',
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--sp-2)',
  },
  statusCardClickable: {
    padding: 'var(--sp-4)',
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--sp-2)',
    cursor: 'pointer',
    transition: 'background 0.15s, transform 0.1s',
  },
  statusCardLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--text-tertiary)',
  },
  statusCardValue: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  statusCardDetail: {
    fontSize: 12,
    color: 'var(--text-secondary)',
  },

  /* Module grid */
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  moduleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 'var(--sp-3)',
  },
  moduleCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--sp-1)',
    padding: 'var(--sp-3) var(--sp-4)',
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    borderLeft: '3px solid var(--status-ok)',
    cursor: 'pointer',
    transition: 'background 0.15s, transform 0.1s',
  },
  moduleAbbr: {
    fontSize: 15,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  },
  moduleName: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  moduleDtcBadge: {
    fontSize: 11,
    fontWeight: 600,
    marginTop: 'var(--sp-1)',
  },

  /* Disconnected state */
  disconnected: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--sp-4)',
    padding: 'var(--sp-8)',
    marginTop: 'var(--sp-8)',
    textAlign: 'center' as const,
  },
  disconnectedIcon: {
    fontSize: 48,
    color: 'var(--text-disabled)',
    lineHeight: 1,
  },
  disconnectedTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  disconnectedText: {
    fontSize: 13,
    color: 'var(--text-tertiary)',
    maxWidth: 360,
    lineHeight: 1.5,
  },
  connectBtn: {
    padding: 'var(--sp-2) var(--sp-6)',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  },

  /* Loading */
  loadingText: {
    fontSize: 13,
    color: 'var(--text-tertiary)',
    padding: 'var(--sp-8)',
    textAlign: 'center' as const,
  },

  /* Error */
  errorBanner: {
    padding: 'var(--sp-3) var(--sp-4)',
    background: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid rgba(255, 82, 82, 0.25)',
    color: 'var(--status-error)',
    fontSize: 13,
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncateVin(vin: string | null): string {
  if (!vin) return '--';
  if (vin.length <= 11) return vin;
  return vin.slice(0, 5) + '...' + vin.slice(-4);
}

function getModuleBorderColor(mod: ModuleStatus): string {
  if (!mod.responding) return 'var(--status-error)';
  if (mod.dtc_count > 0) return 'var(--status-warn)';
  return 'var(--status-ok)';
}

function getDtcStatusColor(count: number): string {
  if (count === 0) return 'var(--status-ok)';
  return 'var(--status-warn)';
}

function formatTimestamp(date: Date | null): string {
  if (!date) return 'Never';
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getModelName(vin: string | null): string {
  // Derive model from VIN positions 4-6 (Volvo SPA platform identification)
  // Fallback to generic name if VIN unavailable
  if (!vin || vin.length < 8) return 'Volvo SPA';

  const modelCode = vin.substring(3, 6);
  const modelMap: Record<string, string> = {
    '256': 'XC90',
    '246': 'XC60',
    '234': 'S90',
    '236': 'V90',
    '226': 'S60',
    '228': 'V60',
  };

  const model = modelMap[modelCode];
  return model ? `Volvo ${model}` : 'Volvo SPA';
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardData>({
    status: null,
    modules: [],
    dtcs: [],
    loading: true,
    error: null,
    lastScan: null,
  });

  const fetchAll = useCallback(async () => {
    try {
      const [status, modules, dtcs] = await Promise.all([
        api.status(),
        api.modules().catch(() => [] as ModuleStatus[]),
        api.dtcReadAll().catch(() => [] as DTC[]),
      ]);

      setData({
        status,
        modules,
        dtcs,
        loading: false,
        error: null,
        lastScan: new Date(),
      });
    } catch {
      setData(prev => ({
        ...prev,
        loading: false,
        error: 'Unable to reach backend. Is the server running?',
      }));
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleConnect = async () => {
    try {
      await api.connect();
      fetchAll();
    } catch {
      // Connection failed silently -- status will remain disconnected
    }
  };

  /* ---- Derived data ---- */

  const { status, modules, dtcs, loading, error, lastScan } = data;
  const connected = status?.connected ?? false;

  const totalDtcs = dtcs.length;
  const modulesWithDtcs = new Set(dtcs.map(d => d.module));
  const affectedModuleCount = modulesWithDtcs.size;
  const respondingCount = modules.filter(m => m.responding).length;
  const notRespondingCount = modules.length - respondingCount;

  // Merge DTC counts from actual DTCs endpoint into modules for accurate display
  const dtcCountByModule: Record<string, number> = {};
  for (const dtc of dtcs) {
    dtcCountByModule[dtc.module] = (dtcCountByModule[dtc.module] || 0) + 1;
  }

  /* ---- Loading state ---- */

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Dashboard</h2>
          <p style={styles.subtitle}>Vehicle overview</p>
        </div>
        <p style={styles.loadingText}>Connecting to backend...</p>
      </div>
    );
  }

  /* ---- Error state ---- */

  if (error && !status) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Dashboard</h2>
          <p style={styles.subtitle}>Vehicle overview</p>
        </div>
        <div style={styles.errorBanner}>{error}</div>
      </div>
    );
  }

  /* ---- Disconnected state ---- */

  if (!connected) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Dashboard</h2>
          <p style={styles.subtitle}>Vehicle overview</p>
        </div>
        <div style={styles.disconnected}>
          <div style={styles.disconnectedIcon}>&#x2299;</div>
          <div style={styles.disconnectedTitle}>Connect to vehicle</div>
          <p style={styles.disconnectedText}>
            No vehicle connection detected. Connect a VOE Ethernet adapter to the
            OBD-II port and ensure the ignition is on.
          </p>
          <button
            style={styles.connectBtn}
            onClick={handleConnect}
            onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '0.85'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '1'; }}
          >
            Discover Vehicle
          </button>
        </div>
      </div>
    );
  }

  /* ---- Connected state ---- */

  const healthSummary =
    notRespondingCount === 0
      ? 'All responding'
      : `${notRespondingCount} not responding`;

  const healthColor =
    notRespondingCount === 0 ? 'var(--status-ok)' : 'var(--status-error)';

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Dashboard</h2>
        <p style={styles.subtitle}>Vehicle overview</p>
      </div>

      {/* Vehicle info bar */}
      <div style={styles.vehicleBar}>
        <div style={styles.vehicleItem}>
          <span style={styles.vehicleLabel}>Vehicle</span>
          <span style={styles.vehicleValue}>
            {getModelName(status!.vehicle_vin)}
          </span>
        </div>
        <div style={styles.vehicleItem}>
          <span style={styles.vehicleLabel}>VIN</span>
          <span
            style={styles.vinValue}
            title={status!.vehicle_vin ?? undefined}
          >
            {truncateVin(status!.vehicle_vin)}
          </span>
        </div>
        <div style={styles.vehicleItem}>
          <span style={styles.vehicleLabel}>Session</span>
          <span style={styles.sessionBadge}>{status!.session_type}</span>
        </div>
      </div>

      {/* Status summary cards */}
      <div style={styles.statusRow}>
        {/* Modules card */}
        <div style={styles.statusCard}>
          <span style={styles.statusCardLabel}>Modules</span>
          <span style={styles.statusCardValue}>{modules.length}</span>
          <span style={{ ...styles.statusCardDetail, color: healthColor }}>
            {healthSummary}
          </span>
        </div>

        {/* DTCs card -- clickable */}
        <div
          style={styles.statusCardClickable}
          onClick={() => navigate('/dtc')}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-recessed)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
          }}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter') navigate('/dtc'); }}
          aria-label={`${totalDtcs} active DTCs across ${affectedModuleCount} modules. Click to view.`}
        >
          <span style={styles.statusCardLabel}>Active DTCs</span>
          <span
            style={{
              ...styles.statusCardValue,
              color: getDtcStatusColor(totalDtcs),
            }}
          >
            {totalDtcs}
          </span>
          <span style={styles.statusCardDetail}>
            {affectedModuleCount === 0
              ? 'No faults detected'
              : `Across ${affectedModuleCount} module${affectedModuleCount > 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Last scan card */}
        <div style={styles.statusCard}>
          <span style={styles.statusCardLabel}>Last Scan</span>
          <span
            style={{
              ...styles.statusCardValue,
              fontSize: 22,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {formatTimestamp(lastScan)}
          </span>
          <span style={styles.statusCardDetail}>
            {lastScan
              ? `${lastScan.toLocaleDateString()}`
              : 'No scans performed'}
          </span>
        </div>
      </div>

      {/* Module status grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <span style={styles.sectionTitle}>Module Status</span>
        <div style={styles.moduleGrid}>
          {modules.map(mod => {
            const borderColor = getModuleBorderColor(mod);
            const dtcCount = dtcCountByModule[mod.name] ?? mod.dtc_count;

            return (
              <div
                key={mod.name}
                style={{
                  ...styles.moduleCard,
                  borderLeftColor: borderColor,
                }}
                onClick={() => navigate(`/dtc?module=${encodeURIComponent(mod.name)}`)}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-recessed)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)';
                }}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter') navigate(`/dtc?module=${encodeURIComponent(mod.name)}`);
                }}
                aria-label={`${mod.full_name}: ${dtcCount > 0 ? `${dtcCount} DTCs` : mod.responding ? 'OK' : 'Not responding'}`}
              >
                <span style={styles.moduleAbbr}>{mod.name}</span>
                <span style={styles.moduleName} title={mod.full_name}>
                  {mod.full_name}
                </span>
                <span
                  style={{
                    ...styles.moduleDtcBadge,
                    color: !mod.responding
                      ? 'var(--status-error)'
                      : dtcCount > 0
                        ? 'var(--status-warn)'
                        : 'var(--status-ok)',
                  }}
                >
                  {!mod.responding
                    ? 'Not responding'
                    : dtcCount > 0
                      ? `${dtcCount} DTC${dtcCount > 1 ? 's' : ''}`
                      : 'OK'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
