use tauri::Manager;
use std::process::{Command, Child};
use std::sync::Mutex;

struct PythonBackend(Mutex<Option<Child>>);

/// Kill a process and all its children on Windows.
/// On other platforms, kill the process directly.
fn kill_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(target_os = "windows")]
    {
        // taskkill /F /T kills the entire process tree
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Send SIGTERM to the process group
        unsafe { libc::kill(-(pid as i32), libc::SIGTERM); }
        let _ = child.kill();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Launch Python FastAPI server
            let child = Command::new("python")
                .args(["-m", "uvicorn", "api.server:app",
                       "--host", "127.0.0.1", "--port", "8384"])
                .current_dir(
                    app.path().resource_dir()
                        .unwrap_or_else(|_| std::env::current_dir().unwrap())
                )
                .spawn()
                .expect("Failed to start Python backend");

            app.manage(PythonBackend(Mutex::new(Some(child))));
            Ok(())
        })
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
