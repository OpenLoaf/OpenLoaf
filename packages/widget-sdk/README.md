# @tenas-ai/widget-sdk

SDK for building Tenas dynamic desktop widgets.

## Install

```bash
npm install @tenas-ai/widget-sdk
```

## Usage

```tsx
import { useWidgetData, useWidgetTheme, type WidgetProps } from '@tenas-ai/widget-sdk'

export default function MyWidget({ sdk }: WidgetProps) {
  const theme = useWidgetTheme(sdk)
  const { data, loading, error } = useWidgetData(sdk, 'getData')

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return (
    <div style={{ color: theme.mode === 'dark' ? '#fff' : '#000' }}>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}
```

## API

### Hooks

- `useWidgetData<T>(sdk, functionName, options?)` — Fetch data via `sdk.call` with loading/error/refetch and optional polling (`refreshInterval`).
- `useWidgetTheme(sdk)` — Subscribe to host theme changes reactively.

### Functions

- `createWidgetSDK(host)` — Create a `WidgetSDK` instance from host callbacks (used internally by the host).

### Types

- `WidgetProps` — Props passed to every widget component (`{ sdk: WidgetSDK }`).
- `WidgetSDK` — SDK interface: `call`, `getTheme`, `onThemeChange`, `emit`, `navigate`, `chat`, `openTab`.
- `WidgetTheme` — `{ mode: 'light' | 'dark' }`.
- `WidgetHostCallbacks` — Callbacks the host provides to power the SDK bridge.

## License

MIT
