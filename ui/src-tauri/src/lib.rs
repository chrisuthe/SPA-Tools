use tauri::Manager;
use serde::Serialize;
use std::path::PathBuf;
use std::process::{Command, Child, Stdio};
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

struct PythonBackend(Mutex<Option<Child>>);

struct ProjectRoot(PathBuf);

// ---------------------------------------------------------------------------
// Return types (must be Serialize for Tauri commands)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
struct PythonStatus {
    found: bool,
    version: Option<String>,
    path: Option<String>,
}

#[derive(Serialize, Clone)]
struct DependencyStatus {
    all_installed: bool,
    missing: Vec<String>,
}

#[derive(Serialize, Clone)]
struct InstallResult {
    success: bool,
    output: String,
}

#[derive(Serialize, Clone)]
struct BackendStatus {
    started: bool,
    error: Option<String>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Try to find a working python executable. Returns (executable_name, version, path).
fn find_python() -> Option<(String, String, String)> {
    for cmd in &["python", "python3"] {
        if let Ok(output) = Command::new(cmd)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            if output.status.success() {
                // `python --version` prints to stdout (Python 3) or stderr (Python 2)
                let raw = String::from_utf8_lossy(&output.stdout).to_string()
                    + &String::from_utf8_lossy(&output.stderr);
                // Parse "Python 3.12.1" -> "3.12.1"
                let version = raw
                    .trim()
                    .strip_prefix("Python ")
                    .unwrap_or(raw.trim())
                    .to_string();

                // Try to get the absolute path via `where` (Windows) or `which` (Unix)
                let path = resolve_executable_path(cmd).unwrap_or_else(|| cmd.to_string());

                return Some((cmd.to_string(), version, path));
            }
        }
    }
    None
}

/// Resolve the full path of an executable.
fn resolve_executable_path(cmd: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    let locator = "where";
    #[cfg(not(target_os = "windows"))]
    let locator = "which";

    Command::new(locator)
        .arg(cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        })
}

/// Find a working pip executable name.
fn find_pip() -> Option<String> {
    for cmd in &["pip", "pip3"] {
        if let Ok(output) = Command::new(cmd)
            .arg("--version")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            if output.status.success() {
                return Some(cmd.to_string());
            }
        }
    }
    None
}

/// Kill a process and all its children on Windows.
/// On other platforms, kill the process directly.
fn kill_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        unsafe { libc::kill(-(pid as i32), libc::SIGTERM); }
        let _ = child.kill();
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn check_python() -> PythonStatus {
    match find_python() {
        Some((_cmd, version, path)) => PythonStatus {
            found: true,
            version: Some(version),
            path: Some(path),
        },
        None => PythonStatus {
            found: false,
            version: None,
            path: None,
        },
    }
}

#[tauri::command]
fn check_dependencies() -> DependencyStatus {
    // Map of import name -> package name for reporting
    let packages: &[(&str, &str)] = &[
        ("fastapi",    "fastapi"),
        ("uvicorn",    "uvicorn"),
        ("udsoncan",   "udsoncan"),
        ("doipclient", "doipclient"),
        ("yaml",       "pyyaml"),
        ("websockets", "websockets"),
    ];

    let python_cmd = find_python().map(|(cmd, _, _)| cmd).unwrap_or_else(|| "python".to_string());

    // First try a single combined import to fast-path the happy case
    let all_imports: Vec<&str> = packages.iter().map(|(imp, _)| *imp).collect();
    let combined = format!(
        "import {}; print('ok')",
        all_imports.join("; import ")
    );

    if let Ok(output) = Command::new(&python_cmd)
        .args(["-c", &combined])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
    {
        if output.status.success() {
            return DependencyStatus {
                all_installed: true,
                missing: vec![],
            };
        }
    }

    // Something is missing — test each individually
    let mut missing = Vec::new();
    for (import_name, package_name) in packages {
        let snippet = format!("import {}", import_name);
        let ok = Command::new(&python_cmd)
            .args(["-c", &snippet])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        if !ok {
            missing.push(package_name.to_string());
        }
    }

    DependencyStatus {
        all_installed: missing.is_empty(),
        missing,
    }
}

#[tauri::command]
fn install_dependencies(state: tauri::State<'_, ProjectRoot>) -> InstallResult {
    let requirements_path = state.0.join("requirements.txt");

    let pip_cmd = match find_pip() {
        Some(cmd) => cmd,
        None => {
            return InstallResult {
                success: false,
                output: "Could not find pip or pip3 on PATH.".to_string(),
            };
        }
    };

    match Command::new(&pip_cmd)
        .args(["install", "-r", &requirements_path.to_string_lossy()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{}{}", stdout, stderr);
            InstallResult {
                success: output.status.success(),
                output: combined,
            }
        }
        Err(e) => InstallResult {
            success: false,
            output: format!("Failed to run {}: {}", pip_cmd, e),
        },
    }
}

#[tauri::command]
fn start_backend(
    state_root: tauri::State<'_, ProjectRoot>,
    state_backend: tauri::State<'_, PythonBackend>,
) -> BackendStatus {
    let python_cmd = match find_python() {
        Some((cmd, _, _)) => cmd,
        None => {
            return BackendStatus {
                started: false,
                error: Some("Python not found on PATH.".to_string()),
            };
        }
    };

    let project_root = &state_root.0;

    match Command::new(&python_cmd)
        .args(["-m", "uvicorn", "api.server:app",
               "--host", "127.0.0.1", "--port", "8384"])
        .current_dir(project_root)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            let mut lock = state_backend.0.lock().unwrap();
            *lock = Some(child);

            // Wait for uvicorn to start accepting connections
            for _ in 0..50 {
                std::thread::sleep(std::time::Duration::from_millis(100));
                if std::net::TcpStream::connect("127.0.0.1:8384").is_ok() {
                    return BackendStatus {
                        started: true,
                        error: None,
                    };
                }
            }

            BackendStatus {
                started: true,
                error: Some("Backend spawned but not yet responding on port 8384.".to_string()),
            }
        }
        Err(e) => BackendStatus {
            started: false,
            error: Some(format!("Failed to start backend: {}", e)),
        },
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Determine the project root (parent of src-tauri/).
            // In dev mode the resource_dir often points into src-tauri, so we
            // walk up until we find requirements.txt or fall back to CWD.
            let project_root = find_project_root(app);

            app.manage(PythonBackend(Mutex::new(None)));
            app.manage(ProjectRoot(project_root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_python,
            check_dependencies,
            install_dependencies,
            start_backend,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<PythonBackend>() {
                    if let Ok(mut child) = state.0.lock() {
                        if let Some(ref mut c) = *child {
                            kill_process_tree(c);
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Walk candidate directories to find the project root (the folder that
/// contains `requirements.txt`).  Candidates in order of preference:
///   1. resource_dir from Tauri (often the app bundle root)
///   2. parent of resource_dir (covers src-tauri/../)
///   3. current working directory
///   4. parent of CWD
///   5. grandparent of CWD
fn find_project_root(app: &tauri::App) -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(res) = app.path().resource_dir() {
        candidates.push(res.clone());
        if let Some(parent) = res.parent() {
            candidates.push(parent.to_path_buf());
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.clone());
        if let Some(p) = cwd.parent() {
            candidates.push(p.to_path_buf());
            if let Some(gp) = p.parent() {
                candidates.push(gp.to_path_buf());
            }
        }
    }

    // Also try the executable's directory and its ancestors
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.to_path_buf());
            if let Some(p) = dir.parent() {
                candidates.push(p.to_path_buf());
                if let Some(gp) = p.parent() {
                    candidates.push(gp.to_path_buf());
                }
            }
        }
    }

    for candidate in &candidates {
        if candidate.join("requirements.txt").exists() {
            return candidate.clone();
        }
    }

    // Last resort: use CWD even if requirements.txt is not there
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}
