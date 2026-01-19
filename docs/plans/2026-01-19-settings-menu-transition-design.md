# Settings Menu Transition Design

## Summary
Add a subtle enter animation when switching settings menus in the project settings page and the main settings page. The animation is a fade-in with a slight upward slide. When UI animation level is set to low, the animation should be disabled by existing global CSS overrides.

## Requirements
- Animate content when a settings menu item is selected.
- Use a fade-in with a small upward motion.
- Disable animation when uiAnimationLevel is low.
- Keep layout and state logic unchanged.

## Proposed Approach
Use the existing tw-animate classes to apply an enter animation on menu switches:
- `animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out`

Trigger the animation by keying the content wrapper with the active menu key so the component remounts on change. Rely on the global rule `html[data-ui-animation-level="low"] *` to zero out animation duration and effectively disable it.

## Implementation Details
- Update `apps/web/src/components/project/settings/ProjectSettingsPage.tsx`:
  - Wrap the active settings panel with a `div` keyed by `activeKey`.
  - Apply the enter animation classes on that wrapper.
- Update `apps/web/src/components/setting/SettingsPage.tsx`:
  - Add the same animation classes to the existing keyed wrapper for the active panel.

## Data Flow
- `activeKey` is already updated on menu change in both pages.
- The keyed wrapper remounts when `activeKey` changes, which triggers the enter animation.

## Error Handling
- If a menu key is invalid, existing fallback logic keeps rendering a null component.
- No new error paths are introduced.

## Testing
Manual checks:
1. Switch between menu items on both pages and confirm the fade-in + slight upward motion.
2. Set UI animation level to low and confirm the content switches without animation.
3. Verify that layout and scroll behavior remain unchanged.

## Out of Scope
- Exit animations for the previous panel.
- Global animation timing changes beyond this view.
