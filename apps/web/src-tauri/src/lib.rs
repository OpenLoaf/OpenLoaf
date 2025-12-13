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

      {
        use tauri::Manager;

        if let Some(window) = app.get_webview_window("main") {
          apply_window_size_from_screen_width(&window, 0.8);

          #[cfg(target_os = "macos")]
          apply_macos_rounded_corners(&window, 12.0);
        }
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn apply_window_size_from_screen_width(window: &tauri::WebviewWindow, width_ratio: f64) {
  const MAX_INIT_WIDTH: u32 = 2800;
  const MAX_INIT_HEIGHT: u32 = 1800;

  let monitor = match window.current_monitor().ok().flatten() {
    Some(monitor) => monitor,
    None => match window.primary_monitor().ok().flatten() {
      Some(monitor) => monitor,
      None => return,
    },
  };

  let width_ratio = width_ratio.clamp(0.1, 1.0);
  let screen = monitor.size();
  let max_width = ((screen.width as f64) * 0.9).round() as u32;
  let mut target_width = ((screen.width as f64) * width_ratio).round() as u32;
  target_width = target_width.min(max_width).min(MAX_INIT_WIDTH);

  let default_aspect_ratio = 10.0 / 16.0;
  let max_height = ((screen.height as f64) * 0.9).round() as u32;
  let max_height = max_height.min(MAX_INIT_HEIGHT);
  let mut target_height = ((target_width as f64) * default_aspect_ratio).round() as u32;
  if target_height > max_height {
    target_height = max_height;
  }

  let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
    width: target_width,
    height: target_height,
  }));

  let monitor_pos = monitor.position();
  let x = monitor_pos.x + ((screen.width.saturating_sub(target_width)) / 2) as i32;
  let y = monitor_pos.y + ((screen.height.saturating_sub(target_height)) / 2) as i32;
  let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
    x,
    y,
  }));
}

#[cfg(target_os = "macos")]
fn apply_macos_rounded_corners(window: &tauri::WebviewWindow, radius: f64) {
  use objc2::{
    msg_send,
    runtime::{AnyClass, AnyObject},
  };
  use std::ffi::CStr;

  let Ok(ns_window) = window.ns_window() else {
    return;
  };

  unsafe {
    let ns_window = &*(ns_window as *mut AnyObject);
    let _: () = msg_send![ns_window, setOpaque: false];

    let ns_color_name = CStr::from_bytes_with_nul(b"NSColor\0").unwrap();
    if let Some(ns_color) = AnyClass::get(ns_color_name) {
      let clear: *mut AnyObject = msg_send![ns_color, clearColor];
      if !clear.is_null() {
        let _: () = msg_send![ns_window, setBackgroundColor: clear];
      }
    }

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
