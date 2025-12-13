#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(target_os = "macos")]
      {
        use tauri::Manager;

        if let Some(window) = app.get_webview_window("main") {
          apply_macos_rounded_corners(&window, 12.0);
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
fn apply_macos_rounded_corners(window: &tauri::WebviewWindow, radius: f64) {
  use objc2::{msg_send, runtime::AnyObject};

  let Ok(ns_window) = window.ns_window() else {
    return;
  };

  unsafe {
    let ns_window = &*(ns_window as *mut AnyObject);
    let content_view: *mut AnyObject = msg_send![ns_window, contentView];
    if content_view.is_null() {
      return;
    }

    let _: () = msg_send![content_view, setWantsLayer: true];
    let layer: *mut AnyObject = msg_send![content_view, layer];
    if layer.is_null() {
      return;
    }

    let _: () = msg_send![layer, setCornerRadius: radius];
    let _: () = msg_send![layer, setMasksToBounds: true];
  }
}
