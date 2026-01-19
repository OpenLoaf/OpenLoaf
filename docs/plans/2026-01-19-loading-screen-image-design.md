## Loading Screen Image Design

### Goals
- Use the provided PNG (`/logo_nobody.png`) as the global loading image in the web app.
- Keep the existing loading label text for clarity and accessibility.
- Avoid new runtime state or behavior changes.

### Scope
- Update the shared loading component used by route loading and gate screens.

### Out of Scope
- Replacing the loading labels or changing the overall layout.
- Adding new animations beyond a subtle, reduced-motion-safe effect.

### Proposed Change
- Replace the current loader icon in `LoadingScreen` with `next/image` rendering `/logo_nobody.png`.
- Keep the container layout (`grid h-svh place-items-center bg-background`) and text placement unchanged.
- Add a gentle `motion-safe:animate-pulse` class to the image to imply activity.
- Fix the image size to a small square (32x32 or 36x36) for consistent layout.

### Components and Files
- `apps/web/src/components/layout/LoadingScreen.tsx` (primary change)
- `apps/web/src/app/loading.tsx`, `ServerConnectionGate`, `StepUpGate` reuse `LoadingScreen` and require no changes.

### Data Flow
- `LoadingScreen` continues to accept an optional `label` and renders it next to the image.
- Call sites remain unchanged; all routes and gates inherit the new image automatically.

### Error Handling and Accessibility
- Provide a descriptive `alt` attribute on the image.
- Keep the label text so the state remains readable if the image fails to load.
- Use `motion-safe` to respect reduced-motion preferences.

### Verification
- Run `pnpm dev:web` and confirm the route loading screen displays the image and label.
- Trigger `ServerConnectionGate` and `StepUpGate` loading states and verify alignment and sizing.
