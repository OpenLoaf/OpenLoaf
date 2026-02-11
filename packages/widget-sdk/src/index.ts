/** Theme information from the host application. */
export interface WidgetTheme {
  /** Current theme mode. */
  mode: 'light' | 'dark'
}

/** SDK interface injected into widget components via props. */
export interface WidgetSDK {
  /** Call a server-side function defined in the widget's package.json scripts. */
  call: <T = unknown>(functionName: string, params?: Record<string, unknown>) => Promise<T>
  /** Get the current theme. */
  getTheme: () => WidgetTheme
  /** Subscribe to theme changes. Returns an unsubscribe function. */
  onThemeChange: (callback: (theme: WidgetTheme) => void) => () => void
  /** Emit a custom event to the host application. */
  emit: (event: string, payload?: unknown) => void
  /** Navigate to a target in the host application. */
  navigate: (target: string, params?: Record<string, unknown>) => void
  /** Trigger an AI chat message. */
  chat: (message: string) => void
  /** Open a tab in the host application. */
  openTab: (type: string, params?: Record<string, unknown>) => void
}

/** Props passed to every dynamic widget component. */
export interface WidgetProps {
  /** The widget SDK instance for interacting with the host. */
  sdk: WidgetSDK
}

/** Callbacks provided by the host to power the SDK bridge. */
export interface WidgetHostCallbacks {
  callFunction: (functionName: string, params?: Record<string, unknown>) => Promise<unknown>
  getTheme: () => WidgetTheme
  onThemeChange: (callback: (theme: WidgetTheme) => void) => () => void
  emit: (event: string, payload?: unknown) => void
  navigate: (target: string, params?: Record<string, unknown>) => void
  chat: (message: string) => void
  openTab: (type: string, params?: Record<string, unknown>) => void
}

/** Create a WidgetSDK instance backed by host callbacks. */
export function createWidgetSDK(host: WidgetHostCallbacks): WidgetSDK {
  return {
    call: host.callFunction as WidgetSDK['call'],
    getTheme: host.getTheme,
    onThemeChange: host.onThemeChange,
    emit: host.emit,
    navigate: host.navigate,
    chat: host.chat,
    openTab: host.openTab,
  }
}
