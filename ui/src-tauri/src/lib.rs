use tauri::Manager;
use std::process::{Command, Child};
use std::sync::Mutex;

struct PythonBackend(Mutex<Option<Child>>);

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
                            let _ = c.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
