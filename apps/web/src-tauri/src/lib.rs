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
          {
            let _ = window.set_title("");
            let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
            apply_macos_titlebar_hide_title(&window);
            apply_macos_traffic_lights_offset(&window, 6.0, 6.0);

            let window_clone = window.clone();
            window.on_window_event(move |event| {
              if matches!(event, tauri::WindowEvent::Resized(..)) {
                apply_macos_traffic_lights_offset(&window_clone, 6.0, 6.0);
              }
            });
          }
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
fn apply_macos_titlebar_hide_title(window: &tauri::WebviewWindow) {
  use objc2_app_kit::{NSWindow, NSWindowTitleVisibility};

  let Ok(ns_window) = window.ns_window() else {
    return;
  };

  let ns_window = unsafe { &*(ns_window as *const NSWindow) };
  ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
  ns_window.setTitlebarAppearsTransparent(true);
}

#[cfg(target_os = "macos")]
fn apply_macos_traffic_lights_offset(
  window: &tauri::WebviewWindow,
  y_offset: f64,
  x_offset: f64,
) {
  use objc2::rc::Retained;
  use objc2_app_kit::{NSButton, NSWindow, NSWindowButton};
  use objc2_foundation::NSPoint;

  let Ok(ns_window) = window.ns_window() else {
    return;
  };

  let ns_window = unsafe { &*(ns_window as *const NSWindow) };

  fn move_button(button: &Retained<NSButton>, y_offset: f64, x_offset: f64) {
    let mut frame = button.frame();
    frame.origin.y -= y_offset;
    frame.origin.x += x_offset;
    button.setFrameOrigin(NSPoint { x: frame.origin.x, y: frame.origin.y });
  }

  if let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) {
    move_button(&close, y_offset, x_offset);
  }
  if let Some(min) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) {
    move_button(&min, y_offset, x_offset);
  }
  if let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) {
    move_button(&zoom, y_offset, x_offset);
  }
}
