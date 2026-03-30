import { useEffect, useRef, useState, useCallback } from 'react';
import { WS } from '../ws';
import type { LiveReading } from '../types';
import Sparkline from '../components/Sparkline';
import TimeChart from '../components/TimeChart';

/* ── Subsystem helpers ── */

type Subsystem = 'Engine' | 'Transmission' | 'Chassis';

const SUBSYSTEM_PREFIXES: Record<Subsystem, string> = {
  Engine: '0xDD',
  Transmission: '0xDE',
  Chassis: '0xDA',
};

function getSubsystem(did: string): Subsystem | null {
  const upper = did.toUpperCase();
  if (upper.startsWith('0XDD')) return 'Engine';
  if (upper.startsWith('0XDE')) return 'Transmission';
  if (upper.startsWith('0XDA')) return 'Chassis';
  return null;
}

/* ── Sensor buffer entry ── */

interface SensorEntry {
  current: LiveReading;
  history: number[]; // last 300 values (5 min @ 1s)
  timestamps: number[]; // parallel array for TimeChart
}

/* ── Color coding ── */

type ValueLevel = 'normal' | 'warning' | 'critical';

function getValueLevel(value: number | null): ValueLevel {
  // Without range metadata from the registry, we cannot determine
  // warning / critical thresholds precisely. The backend LiveReading
  // does not include range info, so we treat all non-null values as
  // normal. The color-coding infrastructure is in place for when
  // range data becomes available.
  if (value === null) return 'normal';
  return 'normal';
}

function levelColor(level: ValueLevel): string {
  switch (level) {
    case 'warning':
      return 'var(--status-warn)';
    case 'critical':
      return 'var(--status-error)';
    default:
      return 'var(--text-primary)';
  }
}

/* ── Constants ── */

const MAX_HISTORY = 300;
const SPARKLINE_WINDOW = 60;

/* ══════════════════════════════════════════════════════════════════ */

type ViewMode = 'cards' | 'table';

export default function LiveData() {
  const wsRef = useRef<WS | null>(null);
  const [connected, setConnected] = useState(false);
  const [sensors, setSensors] = useState<Map<string, SensorEntry>>(new Map());
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const [activeSubsystems, setActiveSubsystems] = useState<Set<Subsystem>>(
    new Set(['Engine', 'Transmission', 'Chassis'])
  );
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  /* ── WebSocket lifecycle ── */

  const handleMessage = useCallback((data: unknown) => {
    const readings = data as LiveReading[];
    if (!Array.isArray(readings)) return;

    setSensors((prev) => {
      const next = new Map(prev);
      for (const r of readings) {
        const key = r.did;
        const existing = next.get(key);
        const val = r.value ?? 0;
        const ts = r.timestamp ?? Date.now();

        if (existing) {
          const history = [...existing.history, val];
          const timestamps = [...existing.timestamps, ts];
          if (history.length > MAX_HISTORY) {
            history.splice(0, history.length - MAX_HISTORY);
            timestamps.splice(0, timestamps.length - MAX_HISTORY);
          }
          next.set(key, { current: r, history, timestamps });
        } else {
          next.set(key, {
            current: r,
            history: [val],
            timestamps: [ts],
          });
        }
      }
      return next;
    });

    setConnected(true);
  }, []);

  useEffect(() => {
    const ws = new WS('/ws/live-data');
    wsRef.current = ws;

    const unsub = ws.onMessage(handleMessage);

    // Track disconnection via the underlying socket
    const origConnect = ws.connect.bind(ws);
    ws.connect = function () {
      origConnect();
      // Patch onclose to detect disconnection
      const sock = (ws as unknown as { socket: WebSocket | null }).socket;
      if (sock) {
        const origOnClose = sock.onclose;
        sock.onclose = (ev) => {
          setConnected(false);
          if (origOnClose) (origOnClose as (ev: CloseEvent) => void)(ev);
        };
      }
    };

    ws.connect();

    return () => {
      unsub();
      ws.disconnect();
    };
  }, [handleMessage]);

  /* ── Subsystem filter ── */

  const toggleSubsystem = (s: Subsystem) => {
    setActiveSubsystems((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        if (next.size > 1) next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  };

  /* ── Filtered sensor list ── */

  const filteredSensors = Array.from(sensors.entries()).filter(([did]) => {
    const sub = getSubsystem(did);
    return sub !== null && activeSubsystems.has(sub);
  });

  const selectedEntry = selectedPid ? sensors.get(selectedPid) : null;

  /* ── Render ── */

  return (
    <div className="view" style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}>Live Data</h2>
          <span
            style={{
              ...styles.badge,
              background: connected
                ? 'rgba(76,175,80,0.15)'
                : 'rgba(255,82,82,0.15)',
              color: connected ? 'var(--status-ok)' : 'var(--status-error)',
            }}
          >
            {connected ? '\u25CF Streaming' : '\u25CF Disconnected'}
          </span>
        </div>

        <div style={styles.headerRight}>
          {/* Subsystem filter chips */}
          <div style={styles.chips}>
            {(Object.keys(SUBSYSTEM_PREFIXES) as Subsystem[]).map((s) => (
              <button
                key={s}
                onClick={() => toggleSubsystem(s)}
                style={{
                  ...styles.chip,
                  ...(activeSubsystems.has(s)
                    ? styles.chipActive
                    : styles.chipInactive),
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div style={styles.viewToggle}>
            <button
              onClick={() => setViewMode('cards')}
              style={{
                ...styles.toggleBtn,
                ...(viewMode === 'cards' ? styles.toggleActive : {}),
              }}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                ...styles.toggleBtn,
                ...(viewMode === 'table' ? styles.toggleActive : {}),
              }}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {filteredSensors.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>
            {connected ? '\u2014' : '\u26A0'}
          </div>
          <p style={styles.emptyTitle}>
            {connected
              ? 'No sensor data for selected subsystems'
              : 'Not connected to vehicle'}
          </p>
          <p style={styles.emptySubtitle}>
            {connected
              ? 'Try enabling more subsystem filters above.'
              : 'Connect to a vehicle to begin streaming live data.'}
          </p>
        </div>
      )}

      {/* Cards view */}
      {viewMode === 'cards' && filteredSensors.length > 0 && (
        <>
          <div style={styles.cardsRow}>
            {filteredSensors.map(([did, entry]) => {
              const level = getValueLevel(entry.current.value);
              const isSelected = selectedPid === did;
              const sparkData = entry.history.slice(-SPARKLINE_WINDOW);

              return (
                <button
                  key={did}
                  onClick={() =>
                    setSelectedPid(isSelected ? null : did)
                  }
                  style={{
                    ...styles.card,
                    ...(isSelected ? styles.cardSelected : {}),
                  }}
                >
                  <div style={styles.cardName}>{entry.current.name}</div>
                  <div style={styles.cardValueRow}>
                    <span
                      style={{
                        ...styles.cardValue,
                        color: levelColor(level),
                      }}
                    >
                      {entry.current.value !== null
                        ? entry.current.value.toFixed(1)
                        : '--'}
                    </span>
                    <span style={styles.cardUnit}>
                      {entry.current.unit}
                    </span>
                  </div>
                  <div style={styles.cardSparkline}>
                    <Sparkline
                      data={sparkData}
                      width={100}
                      height={24}
                      color={
                        level === 'warning'
                          ? 'var(--status-warn)'
                          : level === 'critical'
                            ? 'var(--status-error)'
                            : 'var(--accent)'
                      }
                    />
                  </div>
                  {entry.current.error && (
                    <div style={styles.cardError}>
                      {entry.current.error}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Expanded chart */}
          {selectedEntry && (
            <TimeChart
              data={selectedEntry.timestamps.map((t, i) => ({
                time: t,
                value: selectedEntry.history[i],
              }))}
              label={selectedEntry.current.name}
              unit={selectedEntry.current.unit}
              color="var(--accent)"
            />
          )}
        </>
      )}

      {/* Table view */}
      {viewMode === 'table' && filteredSensors.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Parameter</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Value</th>
                <th style={styles.th}>Unit</th>
                <th style={styles.th}>Trend</th>
                <th style={{ ...styles.th, textAlign: 'center' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSensors.map(([did, entry]) => {
                const level = getValueLevel(entry.current.value);
                const sparkData = entry.history.slice(-SPARKLINE_WINDOW);
                return (
                  <tr
                    key={did}
                    style={styles.tr}
                    onClick={() =>
                      setSelectedPid(
                        selectedPid === did ? null : did
                      )
                    }
                  >
                    <td style={styles.td}>{entry.current.name}</td>
                    <td
                      style={{
                        ...styles.td,
                        ...styles.tdMono,
                        textAlign: 'right',
                        color: levelColor(level),
                      }}
                    >
                      {entry.current.value !== null
                        ? entry.current.value.toFixed(1)
                        : '--'}
                    </td>
                    <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>
                      {entry.current.unit}
                    </td>
                    <td style={styles.td}>
                      <Sparkline
                        data={sparkData}
                        width={80}
                        height={20}
                        color={
                          level === 'warning'
                            ? 'var(--status-warn)'
                            : level === 'critical'
                              ? 'var(--status-error)'
                              : 'var(--accent)'
                        }
                      />
                    </td>
                    <td
                      style={{
                        ...styles.td,
                        textAlign: 'center',
                        fontSize: 14,
                      }}
                    >
                      {level === 'warning' ? (
                        <span style={{ color: 'var(--status-warn)' }}>
                          {'\u25B2'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--accent)' }}>
                          {'\u25CF'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Expanded chart below table */}
          {selectedEntry && (
            <TimeChart
              data={selectedEntry.timestamps.map((t, i) => ({
                time: t,
                value: selectedEntry.history[i],
              }))}
              label={selectedEntry.current.name}
              unit={selectedEntry.current.unit}
              color="var(--accent)"
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Styles ── */

const styles: Record<string, React.CSSProperties> = {
  root: {
    padding: 'var(--sp-6)',
    maxWidth: 1100,
  },

  /* Header */
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--sp-3)',
    marginBottom: 'var(--sp-6)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-4)',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 'var(--radius-sm)',
    letterSpacing: '0.02em',
  },

  /* Subsystem chips */
  chips: {
    display: 'flex',
    gap: 'var(--sp-1)',
  },
  chip: {
    fontSize: 12,
    fontWeight: 500,
    padding: '4px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    transition: 'background 0.15s, color 0.15s',
  },
  chipActive: {
    background: 'var(--accent-tint)',
    color: 'var(--accent-light)',
    borderColor: 'var(--accent)',
  },
  chipInactive: {
    background: 'var(--bg-recessed)',
    color: 'var(--text-tertiary)',
    borderColor: 'var(--text-disabled)',
  },

  /* View toggle */
  viewToggle: {
    display: 'flex',
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
    border: '1px solid var(--text-disabled)',
  },
  toggleBtn: {
    fontSize: 12,
    fontWeight: 500,
    padding: '4px 14px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    background: 'var(--bg-recessed)',
    color: 'var(--text-tertiary)',
    transition: 'background 0.15s, color 0.15s',
  },
  toggleActive: {
    background: 'var(--accent-tint)',
    color: 'var(--accent-light)',
  },

  /* Empty state */
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--sp-8)',
    marginTop: 'var(--sp-8)',
  },
  emptyIcon: {
    fontSize: 32,
    color: 'var(--text-disabled)',
    marginBottom: 'var(--sp-3)',
  },
  emptyTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  emptySubtitle: {
    margin: 0,
    marginTop: 'var(--sp-1)',
    fontSize: 13,
    color: 'var(--text-tertiary)',
  },

  /* Cards */
  cardsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--sp-3)',
  },
  card: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid transparent',
    padding: 'var(--sp-4)',
    minWidth: 160,
    maxWidth: 200,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'var(--font-sans)',
    transition: 'border-color 0.15s, background 0.15s',
  },
  cardSelected: {
    borderColor: 'var(--accent)',
    background: 'var(--accent-tint)',
  },
  cardName: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: 'var(--sp-1)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--sp-1)',
    marginBottom: 'var(--sp-2)',
  },
  cardValue: {
    fontSize: 22,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'var(--font-mono)',
    lineHeight: 1,
  },
  cardUnit: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
  },
  cardSparkline: {
    marginTop: 'var(--sp-1)',
  },
  cardError: {
    fontSize: 10,
    color: 'var(--status-error)',
    marginTop: 'var(--sp-1)',
  },

  /* Table */
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    color: 'var(--text-tertiary)',
    fontWeight: 500,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    borderBottom: '1px solid var(--text-disabled)',
    whiteSpace: 'nowrap',
  },
  tr: {
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  td: {
    padding: '8px 12px',
    color: 'var(--text-primary)',
    borderBottom: '1px solid rgba(74,85,104,0.3)',
    whiteSpace: 'nowrap',
  },
  tdMono: {
    fontFamily: 'var(--font-mono)',
    fontVariantNumeric: 'tabular-nums',
  },
};
