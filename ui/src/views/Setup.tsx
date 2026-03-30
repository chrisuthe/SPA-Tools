import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './Setup.css';

type SetupState = 'checking' | 'python-missing' | 'deps-missing' | 'installing' | 'ready' | 'starting';
type PlatformTab = 'windows' | 'macos' | 'linux';

interface PythonStatus {
  found: boolean;
  version: string | null;
  path: string | null;
}

interface DepStatus {
  all_installed: boolean;
  missing: string[];
}

interface Props {
  onReady: () => void;
}

export default function Setup({ onReady }: Props) {
  const [state, setState] = useState<SetupState>('checking');
  const [pythonStatus, setPythonStatus] = useState<PythonStatus | null>(null);
  const [depStatus, setDepStatus] = useState<DepStatus | null>(null);
  const [installOutput, setInstallOutput] = useState('');
  const [installError, setInstallError] = useState<string | null>(null);
  const [platformTab, setPlatformTab] = useState<PlatformTab>('windows');
  const [manualExpanded, setManualExpanded] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null!);  // eslint-disable-line @typescript-eslint/no-non-null-assertion

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  const runChecks = useCallback(async () => {
    setState('checking');
    setPythonStatus(null);
    setDepStatus(null);
    setInstallError(null);

    try {
      const python = await invoke<PythonStatus>('check_python');
      setPythonStatus(python);

      if (!python.found) {
        setState('python-missing');
        return;
      }

      const deps = await invoke<DepStatus>('check_dependencies');
      setDepStatus(deps);

      if (!deps.all_installed) {
        setState('deps-missing');
        return;
      }

      setState('ready');
    } catch (err) {
      console.error('Setup check failed:', err);
      setState('python-missing');
    }
  }, []);

  const handleInstall = useCallback(async () => {
    setState('installing');
    setInstallOutput('');
    setInstallError(null);

    try {
      const result = await invoke<{ success: boolean; output: string }>('install_dependencies');
      setInstallOutput(result.output);

      if (result.success) {
        setState('ready');
      } else {
        setInstallError('Installation failed. Check the output above for details.');
        setState('deps-missing');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setInstallError(msg);
      setInstallOutput((prev) => prev + '\n' + msg);
      setState('deps-missing');
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    runChecks();
  }, [runChecks]);

  // Auto-proceed: ready → starting after 1s
  useEffect(() => {
    if (state === 'ready') {
      const timer = setTimeout(() => setState('starting'), 1000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Starting state: spawn backend, poll until healthy, then proceed
  useEffect(() => {
    if (state !== 'starting') return;
    let cancelled = false;

    (async () => {
      try {
        const backend = await invoke<{ started: boolean; error: string | null }>('start_backend');
        if (cancelled) return;

        if (!backend.started) {
          setInstallError(backend.error || 'Failed to start backend.');
          setState('deps-missing');
          return;
        }

        // Poll /api/health until the server is responding
        for (let i = 0; i < 30; i++) {
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 500));
          try {
            const res = await fetch('http://127.0.0.1:8384/api/health');
            if (res.ok) {
              onReady();
              return;
            }
          } catch {
            // Not ready yet
          }
        }
        // Timed out — proceed anyway, Dashboard will show its own error
        if (!cancelled) onReady();
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setInstallError(msg);
        setState('deps-missing');
      }
    })();

    return () => { cancelled = true; };
  }, [state, onReady]);

  // Scroll install output to bottom
  useEffect(() => {
    scrollToBottom();
  }, [installOutput, scrollToBottom]);

  // Detect platform for default tab
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) setPlatformTab('macos');
    else if (ua.includes('linux')) setPlatformTab('linux');
    else setPlatformTab('windows');
  }, []);

  return (
    <div className="setup-screen">
      <div className="setup-container">
        <div className="setup-logo">
          <span className="setup-hexagon">&#x2B21;</span>
          <span className="setup-brand">SPATools</span>
        </div>

        {state === 'checking' && <CheckingView />}
        {state === 'python-missing' && (
          <PythonMissingView
            pythonStatus={pythonStatus}
            platformTab={platformTab}
            onTabChange={setPlatformTab}
            onRetry={runChecks}
          />
        )}
        {state === 'deps-missing' && (
          <DepsMissingView
            pythonStatus={pythonStatus}
            depStatus={depStatus}
            manualExpanded={manualExpanded}
            onToggleManual={() => setManualExpanded((v) => !v)}
            onInstall={handleInstall}
            error={installError}
          />
        )}
        {state === 'installing' && (
          <InstallingView output={installOutput} outputRef={outputRef} />
        )}
        {state === 'ready' && (
          <ReadyView
            pythonStatus={pythonStatus}
            onLaunch={() => setState('starting')}
          />
        )}
        {state === 'starting' && (
          <StartingView />
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-views ---------- */

function CheckingView() {
  return (
    <div className="setup-section">
      <div className="setup-spinner" />
      <h2 className="setup-heading">Checking system requirements</h2>
      <p className="setup-subtext">Verifying Python installation and dependencies...</p>
    </div>
  );
}

function PythonMissingView({
  pythonStatus,
  platformTab,
  onTabChange,
  onRetry,
}: {
  pythonStatus: PythonStatus | null;
  platformTab: PlatformTab;
  onTabChange: (t: PlatformTab) => void;
  onRetry: () => void;
}) {
  return (
    <div className="setup-section">
      <div className="setup-icon-warn">&#x26A0;</div>
      <h2 className="setup-heading">Python Not Found</h2>
      <p className="setup-subtext">
        SPATools requires Python 3.10 or later to communicate with your vehicle.
      </p>

      {pythonStatus?.path && (
        <div className="setup-info-box">
          <span className="setup-info-label">Detected:</span>{' '}
          <span className="mono">{pythonStatus.path}</span>
          {pythonStatus.version && (
            <span className="text-secondary"> (v{pythonStatus.version})</span>
          )}
        </div>
      )}

      <div className="setup-tabs">
        {(['windows', 'macos', 'linux'] as PlatformTab[]).map((tab) => (
          <button
            key={tab}
            className={`setup-tab ${platformTab === tab ? 'active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab === 'windows' ? 'Windows' : tab === 'macos' ? 'macOS' : 'Linux'}
          </button>
        ))}
      </div>

      <div className="setup-tab-content">
        {platformTab === 'windows' && (
          <div>
            <p>Download from <span className="setup-link">python.org/downloads</span> or run:</p>
            <code className="setup-code">winget install Python.Python.3.12</code>
          </div>
        )}
        {platformTab === 'macos' && (
          <div>
            <p>Install via Homebrew or download from python.org:</p>
            <code className="setup-code">brew install python</code>
          </div>
        )}
        {platformTab === 'linux' && (
          <div>
            <p>Debian / Ubuntu:</p>
            <code className="setup-code">sudo apt install python3</code>
            <p style={{ marginTop: 'var(--sp-2)' }}>Fedora:</p>
            <code className="setup-code">sudo dnf install python3</code>
          </div>
        )}
      </div>

      <p className="setup-hint">After installing Python, click Retry to check again.</p>

      <button className="setup-btn setup-btn-primary" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function DepsMissingView({
  pythonStatus,
  depStatus,
  manualExpanded,
  onToggleManual,
  onInstall,
  error,
}: {
  pythonStatus: PythonStatus | null;
  depStatus: DepStatus | null;
  manualExpanded: boolean;
  onToggleManual: () => void;
  onInstall: () => void;
  error: string | null;
}) {
  return (
    <div className="setup-section">
      <div className="setup-checklist">
        <div className="setup-check-item ok">
          <span className="setup-check-icon">&#x2713;</span>
          <span>
            Python {pythonStatus?.version && <span className="mono text-secondary">v{pythonStatus.version}</span>}
          </span>
        </div>
        {depStatus?.missing.map((pkg) => (
          <div key={pkg} className="setup-check-item warn">
            <span className="setup-check-icon">&#x25CF;</span>
            <span className="mono">{pkg}</span>
            <span className="text-secondary"> -- missing</span>
          </div>
        ))}
      </div>

      {error && <div className="setup-error-box">{error}</div>}

      <button className="setup-btn setup-btn-primary" onClick={onInstall}>
        Install Dependencies
      </button>
      <p className="setup-hint">
        This will run: <code className="mono">pip install -r requirements.txt</code>
      </p>

      <button className="setup-expand-btn" onClick={onToggleManual}>
        {manualExpanded ? '▾' : '▸'} Install Manually
      </button>
      {manualExpanded && (
        <div className="setup-manual-section">
          <p className="setup-subtext">Run this command in your terminal:</p>
          <code className="setup-code">
            pip install -r requirements.txt
          </code>
          {depStatus?.missing && depStatus.missing.length > 0 && (
            <>
              <p className="setup-subtext" style={{ marginTop: 'var(--sp-3)' }}>Or install individually:</p>
              <code className="setup-code">
                pip install {depStatus.missing.join(' ')}
              </code>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function InstallingView({
  output,
  outputRef,
}: {
  output: string;
  outputRef: React.RefObject<HTMLPreElement>;
}) {
  return (
    <div className="setup-section">
      <div className="setup-spinner" />
      <h2 className="setup-heading">Installing dependencies</h2>
      <div className="setup-terminal">
        <pre ref={outputRef}>{output || 'Waiting for output...'}</pre>
      </div>
      <button className="setup-btn setup-btn-dim" disabled>
        Cancel
      </button>
    </div>
  );
}

function StartingView() {
  return (
    <div className="setup-section">
      <div className="setup-spinner" />
      <h2 className="setup-heading">Starting SPATools</h2>
      <p className="setup-subtext">Launching the backend server...</p>
    </div>
  );
}

function ReadyView({
  pythonStatus,
  onLaunch,
}: {
  pythonStatus: PythonStatus | null;
  onLaunch: () => void;
}) {
  return (
    <div className="setup-section">
      <div className="setup-checklist">
        <div className="setup-check-item ok">
          <span className="setup-check-icon">&#x2713;</span>
          <span>
            Python {pythonStatus?.version && <span className="mono text-secondary">v{pythonStatus.version}</span>}
          </span>
        </div>
        <div className="setup-check-item ok">
          <span className="setup-check-icon">&#x2713;</span>
          <span>All dependencies installed</span>
        </div>
      </div>

      <h2 className="setup-heading setup-heading-ready">All set!</h2>
      <p className="setup-subtext">Starting SPATools...</p>

      <button className="setup-btn setup-btn-primary" onClick={onLaunch}>
        Launch
      </button>
    </div>
  );
}
