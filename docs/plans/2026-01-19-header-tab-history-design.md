# Header Tab History Buttons Design

## Goal
Add back/forward buttons in the header tab area to navigate the selection history for the current workspace. Closed tabs are skipped. After a back navigation, selecting a new tab clears the forward history.

## Behavior
- History is scoped per workspace and stored in memory only.
- Manual tab switches push the previous tab into the back stack and clear the forward stack.
- Back navigation pops from the back stack, skips closed tabs, and pushes the current tab onto the forward stack.
- Forward navigation mirrors back navigation, using the forward stack and pushing to back.
- Navigation triggered by back/forward does not re-record history.

## Data Flow
- `HeaderTabs` maintains a ref map keyed by workspace ID with `{ back, forward, lastActiveId }`.
- A `useEffect` listens to `activeTabId` changes and updates history when the change is not history-driven.
- Back/forward handlers pop valid targets, push the current tab to the opposite stack, and call `setActiveTab`.

## UI Placement
- Two icon-sized buttons, labeled `<` and `>`, are added to the left of the scrollable tab strip.
- Buttons are disabled when no valid back/forward target exists in the current workspace.

## Edge Cases
- If the active tab is not part of the current workspace, history is not updated.
- Closed tabs are skipped during navigation.
- Switching workspaces uses separate history stacks.

## Testing
Manual checks:
- A -> B -> C, back -> B, forward -> C.
- Back then select D, forward history clears.
- Close B, back from C skips to A.
