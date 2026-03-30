import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { WS } from '../ws';
import type { ScanProgress, StatusResponse } from '../types';

/* ------------------------------------------------------------------ */
/*  Known DID lookup                                                   */
/* ------------------------------------------------------------------ */

const KNOWN_DIDS: Record<string, string> = {
  '0xDD01': 'coolant_temp',
  '0xDD02': 'intake_air_temp',
  '0xDD03': 'boost_pressure',
  '0xDD04': 'engine_rpm',
  '0xDD05': 'throttle_position',
  '0xDD10': 'oil_temp',
  '0xDD11': 'lambda',
  '0xDD20': 'ignition_advance',
  '0xDE01': 'current_gear',
  '0xDE10': 'atf_temp',
  '0xDA01': 'battery_voltage',
  '0xDA02': 'vehicle_speed',
  '0xF190': 'vin',
  '0xF18C': 'ecu_serial',
  '0xF101': 'software_version',
  '0xF191': 'hardware_version',
};

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ResultRow {
  did: string;
  rawData: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const HEX_RE = /^[0-9a-fA-F]*$/;

function isValidHex(value: string): boolean {
  return HEX_RE.test(value) && value.length > 0 && value.length <= 4;
}

function toHexDisplay(value: string): string {
  return '0x' + value.toUpperCase().padStart(4, '0');
}

function formatDidHex(did: number): string {
  return '0x' + did.toString(16).toUpperCase().padStart(4, '0');
}

/* ------------------------------------------------------------------ */
/*  CSS-in-JS styles (scoped to this view)                             */
/* ------------------------------------------------------------------ */

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--sp-6)',
    maxWidth: 960,
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--sp-3)',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: 13,
  },

  /* Disconnected banner */
  disconnected: {
    background: 'var(--bg-card)',
    border: '1px solid var(--text-disabled)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--sp-8)',
    textAlign: 'center' as const,
    color: 'var(--text-tertiary)',
    fontSize: 14,
  },

  /* Config panel */
  configPanel: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--sp-4)',
    display: 'flex',
    alignItems: 'flex-end',
    gap: 'var(--sp-4)',
    flexWrap: 'wrap' as const,
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--sp-1)',
  },
  label: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  hexInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--bg-recessed)',
    border: '1px solid var(--text-disabled)',
    borderRadius: 'var(--radius-sm)',
    overflow: 'hidden',
  },
  hexInputWrapperInvalid: {
    borderColor: 'var(--status-error)',
  },
  hexPrefix: {
    padding: '6px 6px 6px 10px',
    color: 'var(--text-disabled)',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    userSelect: 'none' as const,
  },
  hexInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    padding: '6px 10px 6px 0',
    width: 60,
    textTransform: 'uppercase' as const,
  },

  /* Buttons */
  btnPrimary: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '7px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnStop: {
    background: 'var(--status-error)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '7px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnExport: {
    background: 'transparent',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-sm)',
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },

  /* Progress bar */
  progressPanel: {
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--sp-4)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--sp-3)',
  },
  progressInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
  progressBarOuter: {
    height: 8,
    background: 'var(--bg-recessed)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  progressBarInner: {
    height: '100%',
    borderRadius: 4,
    background: 'linear-gradient(90deg, var(--accent), var(--accent-light), var(--accent))',
    backgroundSize: '200% 100%',
    transition: 'width 0.3s ease',
  },

  /* Results */
  resultsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultsTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '1px solid var(--text-disabled)',
    color: 'var(--text-tertiary)',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    fontWeight: 600,
  },
  td: {
    padding: '6px 12px',
    borderBottom: '1px solid var(--bg-recessed)',
  },
  tdMono: {
    padding: '6px 12px',
    borderBottom: '1px solid var(--bg-recessed)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  },
  knownBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    color: 'var(--status-ok)',
    fontSize: 12,
  },
  unknownBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-1)',
    color: 'var(--status-warn)',
    fontSize: 12,
  },
  emptyState: {
    padding: 'var(--sp-8)',
    textAlign: 'center' as const,
    color: 'var(--text-disabled)',
    fontSize: 13,
  },
};

/* Keyframes for progress bar shimmer — injected once */
const ANIM_ID = 'scanner-shimmer';
if (typeof document !== 'undefined' && !document.getElementById(ANIM_ID)) {
  const styleEl = document.createElement('style');
  styleEl.id = ANIM_ID;
  styleEl.textContent = `
    @keyframes scanner-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Scanner() {
  /* -- Connection state -- */
  const [connected, setConnected] = useState<boolean | null>(null);

  /* -- Scan config -- */
  const [startHex, setStartHex] = useState('DD00');
  const [endHex, setEndHex] = useState('DDFF');

  /* -- Scan state -- */
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [scanComplete, setScanComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WS | null>(null);

  /* -- Check connection status -- */
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      api.status().then((s: StatusResponse) => {
        if (!cancelled) setConnected(s.connected);
      }).catch(() => {
        if (!cancelled) setConnected(false);
      });
    };
    check();
    const interval = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  /* -- Cleanup WebSocket on unmount -- */
  useEffect(() => {
    return () => {
      wsRef.current?.disconnect();
    };
  }, []);

  /* -- Validation -- */
  const startValid = isValidHex(startHex);
  const endValid = isValidHex(endHex);
  const startInt = parseInt(startHex, 16);
  const endInt = parseInt(endHex, 16);
  const rangeValid = startValid && endValid && startInt <= endInt;

  /* -- Start scan -- */
  const handleStart = useCallback(async () => {
    if (!rangeValid || scanning) return;

    setError(null);
    setResults([]);
    setProgress(null);
    setScanComplete(false);

    try {
      await api.startScan(startInt, endInt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      return;
    }

    setScanning(true);

    /* Connect WebSocket for progress updates */
    const ws = new WS('/ws/scan-progress');
    wsRef.current = ws;

    ws.onMessage((data: unknown) => {
      const msg = data as ScanProgress & { result?: { did: string; raw: string } };

      setProgress({
        current_did: msg.current_did,
        percent: msg.percent,
        found_count: msg.found_count,
        complete: msg.complete,
      });

      /* Append result if present */
      if (msg.result) {
        setResults((prev) => [
          ...prev,
          { did: msg.result!.did, rawData: msg.result!.raw },
        ]);
      }

      /* Scan finished */
      if (msg.complete) {
        setScanning(false);
        setScanComplete(true);
        ws.disconnect();
        wsRef.current = null;
      }
    });

    ws.connect();
  }, [rangeValid, scanning, startInt, endInt]);

  /* -- Stop scan -- */
  const handleStop = useCallback(async () => {
    try {
      await api.stopScan();
    } catch {
      /* best-effort */
    }
    wsRef.current?.disconnect();
    wsRef.current = null;
    setScanning(false);
    setScanComplete(results.length > 0);
  }, [results.length]);

  /* -- Export JSON -- */
  const handleExport = useCallback(() => {
    const payload = {
      scan_range: {
        start: toHexDisplay(startHex),
        end: toHexDisplay(endHex),
      },
      total_responsive: results.length,
      results: Object.fromEntries(
        results.map((r) => [r.did, r.rawData])
      ),
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'did_scan_results.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [results, startHex, endHex]);

  /* -- Disconnected state -- */
  if (connected === false) {
    return (
      <div className="view" style={styles.container}>
        <div style={styles.header}>
          <h2>DID Scanner</h2>
          <span style={styles.subtitle}>Research DID discovery</span>
        </div>
        <div style={styles.disconnected}>
          Connect to vehicle to start scanning
        </div>
      </div>
    );
  }

  return (
    <div className="view" style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2>DID Scanner</h2>
        <span style={styles.subtitle}>Research DID discovery</span>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ ...styles.disconnected, borderColor: 'var(--status-error)', color: 'var(--status-error)' }}>
          {error}
        </div>
      )}

      {/* Scan config panel */}
      <div style={styles.configPanel}>
        <div style={styles.inputGroup}>
          <span style={styles.label}>Start DID</span>
          <div style={{
            ...styles.hexInputWrapper,
            ...(startHex.length > 0 && !startValid ? styles.hexInputWrapperInvalid : {}),
          }}>
            <span style={styles.hexPrefix}>0x</span>
            <input
              style={styles.hexInput}
              value={startHex}
              onChange={(e) => setStartHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 4))}
              placeholder="DD00"
              disabled={scanning}
              maxLength={4}
            />
          </div>
        </div>

        <div style={styles.inputGroup}>
          <span style={styles.label}>End DID</span>
          <div style={{
            ...styles.hexInputWrapper,
            ...(endHex.length > 0 && !endValid ? styles.hexInputWrapperInvalid : {}),
          }}>
            <span style={styles.hexPrefix}>0x</span>
            <input
              style={styles.hexInput}
              value={endHex}
              onChange={(e) => setEndHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 4))}
              placeholder="DDFF"
              disabled={scanning}
              maxLength={4}
            />
          </div>
        </div>

        {!scanning ? (
          <button
            style={{
              ...styles.btnPrimary,
              ...(!rangeValid || connected === null ? styles.btnDisabled : {}),
            }}
            onClick={handleStart}
            disabled={!rangeValid || scanning || connected === null}
          >
            Start Scan
          </button>
        ) : (
          <button style={styles.btnStop} onClick={handleStop}>
            Stop Scan
          </button>
        )}
      </div>

      {/* Progress bar */}
      {(scanning || progress) && (
        <div style={styles.progressPanel}>
          <div style={styles.progressInfo}>
            <span className="mono">
              {progress
                ? `Scanning ${progress.current_did}`
                : 'Initializing...'}
            </span>
            <span>
              {progress ? `${progress.found_count} found` : ''}
            </span>
            <span className="tabular">
              {progress ? `${progress.percent.toFixed(1)}%` : '0.0%'}
            </span>
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${progress?.percent ?? 0}%`,
                animation: scanning ? 'scanner-shimmer 2s linear infinite' : 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {(results.length > 0 || scanComplete) && (
        <div>
          <div style={styles.resultsHeader}>
            <span style={styles.resultsTitle}>
              Results ({results.length} responsive DID{results.length !== 1 ? 's' : ''})
            </span>
            {scanComplete && results.length > 0 && (
              <button style={styles.btnExport} onClick={handleExport}>
                Export JSON
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div style={styles.emptyState}>
              No responsive DIDs found in range.
            </div>
          ) : (
            <div style={{ marginTop: 'var(--sp-3)', overflowX: 'auto' as const }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>DID</th>
                    <th style={styles.th}>Raw Data</th>
                    <th style={styles.th}>Known?</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => {
                    const hexKey = row.did.startsWith('0x') ? row.did : formatDidHex(parseInt(row.did, 16));
                    const knownName = KNOWN_DIDS[hexKey];
                    return (
                      <tr key={row.did}>
                        <td style={styles.tdMono}>{hexKey}</td>
                        <td style={styles.tdMono}>{row.rawData}</td>
                        <td style={styles.td}>
                          {knownName ? (
                            <span style={styles.knownBadge}>
                              <span style={{ fontSize: 14 }}>&#x2713;</span>
                              {knownName}
                            </span>
                          ) : (
                            <span style={styles.unknownBadge}>
                              <span style={{ fontSize: 14, fontWeight: 700 }}>?</span>
                              Unknown
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
