// Tauri 应用主入口点，移动端时自动作为入口
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 调试模式下启用日志插件，日志级别为 Info
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            {
                use tauri::Manager;

                // 获取主窗口实例
                if let Some(window) = app.get_webview_window("main") {
                    // 根据屏幕宽度设置窗口大小，宽度占屏幕的 80%
                    apply_window_size_from_screen_width(&window, 0.8);

                    // macOS 平台特定配置
                    #[cfg(target_os = "macos")]
                    {
                        // 设置窗口标题为空
                        let _ = window.set_title("");
                        // 设置标题栏样式为覆盖式
                        let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                        // 隐藏标题栏并设置透明
                        apply_macos_titlebar_hide_title(&window);
                        // 调整交通灯（关闭、最小化、最大化按钮）的偏移量
                        apply_macos_traffic_lights_offset(&window, 6.0, 6.0);

                        // 监听窗口大小变化事件（防抖），动态调整交通灯位置，避免高频闪烁
                        install_macos_traffic_lights_resize_debounced(&window, 6.0, 6.0);
                    }
                }
            }
            Ok(())
        })
        // 运行应用，使用自动生成的上下文
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 根据屏幕宽度计算并设置窗口大小和位置
/// - 参数: window - 要设置的窗口实例
/// - 参数: width_ratio - 窗口宽度占屏幕宽度的比例
fn apply_window_size_from_screen_width(window: &tauri::WebviewWindow, width_ratio: f64) {
    // 窗口初始化的最大宽度和高度
    const MAX_INIT_WIDTH: u32 = 2800;
    const MAX_INIT_HEIGHT: u32 = 1800;

    // 获取当前显示器或主显示器
    let monitor = match window.current_monitor().ok().flatten() {
        Some(monitor) => monitor,
        None => match window.primary_monitor().ok().flatten() {
            Some(monitor) => monitor,
            None => return,
        },
    };

    // 确保宽度比例在 0.1 到 1.0 之间
    let width_ratio = width_ratio.clamp(0.1, 1.0);
    let screen = monitor.size();
    // 计算最大允许宽度（屏幕宽度的 90%）
    let max_width = ((screen.width as f64) * 0.9).round() as u32;
    // 计算目标宽度，取最小值（比例宽度、最大允许宽度、预设最大宽度）
    let mut target_width = ((screen.width as f64) * width_ratio).round() as u32;
    target_width = target_width.min(max_width).min(MAX_INIT_WIDTH);

    // 默认宽高比 10:16（竖屏优先）
    let default_aspect_ratio = 10.0 / 16.0;
    // 计算最大允许高度（屏幕高度的 90%）
    let max_height = ((screen.height as f64) * 0.9).round() as u32;
    let max_height = max_height.min(MAX_INIT_HEIGHT);
    // 根据宽度和宽高比计算目标高度
    let mut target_height = ((target_width as f64) * default_aspect_ratio).round() as u32;
    // 确保高度不超过最大允许高度
    if target_height > max_height {
        target_height = max_height;
    }

    // 设置窗口物理尺寸
    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: target_width,
        height: target_height,
    }));

    // 计算窗口居中位置
    let monitor_pos = monitor.position();
    let x = monitor_pos.x + ((screen.width.saturating_sub(target_width)) / 2) as i32;
    let y = monitor_pos.y + ((screen.height.saturating_sub(target_height)) / 2) as i32;
    // 设置窗口物理位置
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
}

/// macOS 平台：隐藏标题栏并设置透明
/// - 参数: window - 要设置的窗口实例
#[cfg(target_os = "macos")]
fn apply_macos_titlebar_hide_title(window: &tauri::WebviewWindow) {
    use objc2_app_kit::{NSWindow, NSWindowTitleVisibility};

    // 获取 NSWindow 实例，失败则返回
    let Ok(ns_window) = window.ns_window() else {
        return;
    };

    // 转换为 NSWindow 引用（不安全操作）
    let ns_window = unsafe { &*(ns_window as *const NSWindow) };
    // 隐藏标题
    ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
    // 设置标题栏透明
    ns_window.setTitlebarAppearsTransparent(true);
}

/// macOS 平台：监听窗口缩放事件（防抖）并重置交通灯按钮位置
#[cfg(target_os = "macos")]
fn install_macos_traffic_lights_resize_debounced(
    window: &tauri::WebviewWindow,
    y_offset: f64,
    x_offset: f64,
) {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::sync::Arc;
    use std::thread;
    use std::time::Duration;

    // trailing-edge debounce：连续 Resized 事件停止一小段时间后，再执行一次重定位
    const DEBOUNCE_MS: u64 = 80;
    let debounce = Duration::from_millis(DEBOUNCE_MS);
    const RESIZE_ALPHA: f64 = 0.0;

    let (tx, rx) = mpsc::channel::<()>();
    let window_for_thread = window.clone();
    let is_transparent = Arc::new(AtomicBool::new(false));
    let is_transparent_for_thread = Arc::clone(&is_transparent);

    thread::spawn(move || {
        loop {
            // 等待第一次事件；窗口被销毁/程序退出时通道断开，线程自动结束
            if rx.recv().is_err() {
                break;
            }

            // 在防抖窗口内持续“吞掉”后续事件
            while rx.recv_timeout(debounce).is_ok() {}

            // UI 相关操作尽量在主线程执行
            let window_for_main = window_for_thread.clone();
            let is_transparent_for_main = Arc::clone(&is_transparent_for_thread);
            let _ = window_for_thread.run_on_main_thread(move || {
                // 缩放结束：先重定位，再恢复不透明，减少视觉跳动
                apply_macos_traffic_lights_offset(&window_for_main, y_offset, x_offset);
                set_macos_traffic_lights_alpha(&window_for_main, 1.0);
                is_transparent_for_main.store(false, Ordering::SeqCst);
            });
        }
    });

    let tx_on_resize = tx.clone();
    let window_for_resize = window.clone();
    let is_transparent_for_resize = Arc::clone(&is_transparent);
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Resized(..)) {
            // 缩放中：只在第一次事件到来时置为透明一次，避免反复触发造成闪烁
            if !is_transparent_for_resize.swap(true, Ordering::SeqCst) {
                let window_for_main = window_for_resize.clone();
                let _ = window_for_resize.run_on_main_thread(move || {
                    set_macos_traffic_lights_alpha(&window_for_main, RESIZE_ALPHA);
                });
            }
            let _ = tx_on_resize.send(());
        }
    });
}

/// macOS 平台：设置交通灯按钮透明度（Close/Miniaturize/Zoom）
#[cfg(target_os = "macos")]
fn set_macos_traffic_lights_alpha(window: &tauri::WebviewWindow, alpha: f64) {
    use objc2_app_kit::{NSButton, NSWindow, NSWindowButton};

    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    let ns_window = unsafe { &*(ns_window as *const NSWindow) };

    fn set_alpha(button: &NSButton, alpha: f64) {
        button.setAlphaValue(alpha);
    }

    if let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) {
        set_alpha(&close, alpha);
    }
    if let Some(min) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) {
        set_alpha(&min, alpha);
    }
    if let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) {
        set_alpha(&zoom, alpha);
    }
}

/// macOS 平台：调整交通灯按钮的偏移量
/// - 参数: window - 要设置的窗口实例
/// - 参数: y_offset - Y 轴偏移量（向下为负）
/// - 参数: x_offset - X 轴偏移量（向右为正）
#[cfg(target_os = "macos")]
fn apply_macos_traffic_lights_offset(window: &tauri::WebviewWindow, y_offset: f64, x_offset: f64) {
    use objc2::rc::Retained;
    use objc2_app_kit::{NSButton, NSWindow, NSWindowButton};
    use objc2_foundation::NSPoint;

    // 获取 NSWindow 实例，失败则返回
    let Ok(ns_window) = window.ns_window() else {
        return;
    };

    // 转换为 NSWindow 引用（不安全操作）
    let ns_window = unsafe { &*(ns_window as *const NSWindow) };

    /// 移动单个按钮的辅助函数
    /// - 参数: button - 要移动的按钮实例
    /// - 参数: y_offset - Y 轴偏移量
    /// - 参数: x_offset - X 轴偏移量
    fn move_button(button: &Retained<NSButton>, y_offset: f64, x_offset: f64) {
        // 获取按钮当前框架
        let mut frame = button.frame();
        // 应用偏移量
        frame.origin.y -= y_offset;
        frame.origin.x += x_offset;
        // 设置新位置
        button.setFrameOrigin(NSPoint {
            x: frame.origin.x,
            y: frame.origin.y,
        });
    }

    // 调整关闭按钮位置
    if let Some(close) = ns_window.standardWindowButton(NSWindowButton::CloseButton) {
        move_button(&close, y_offset, x_offset);
    }
    // 调整最小化按钮位置
    if let Some(min) = ns_window.standardWindowButton(NSWindowButton::MiniaturizeButton) {
        move_button(&min, y_offset, x_offset);
    }
    // 调整最大化按钮位置
    if let Some(zoom) = ns_window.standardWindowButton(NSWindowButton::ZoomButton) {
        move_button(&zoom, y_offset, x_offset);
    }
}
