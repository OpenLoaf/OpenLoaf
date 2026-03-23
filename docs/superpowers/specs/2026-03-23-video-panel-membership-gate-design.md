# Video Panel Membership Gate Design

## Goal

Restrict video generation to Pro and above membership levels. Free and Lite users see a lock overlay in VideoAiPanel with an upgrade button. Unauthenticated users retain existing behavior (login dialog on generate click).

## Rules

| User State | Behavior |
|------------|----------|
| Not logged in | Normal panel, login dialog on generate (existing behavior) |
| Logged in, free/lite | Lock overlay with upgrade button |
| Logged in, pro/premium/infinity | Normal panel |

## Approach

Early return pattern inside `VideoAiPanel`. When `isVideoLocked` is true, the component returns a lock screen UI instead of the normal panel content.

## Data Flow

```
VideoAiPanel
  ├─ useSaasAuth(s => s.loggedIn)        → loggedIn
  ├─ useQuery(['saas','userProfile'])      → profileQuery
  ├─ isVideoLocked = loggedIn
  │     && profileQuery.data != null
  │     && (level === 'free' || level === 'lite')
  └─ if isVideoLocked → return <LockOverlay> + <PricingDialog>
```

- `fetchUserProfile` is reused from `saas-auth.ts` (same as SidebarUserAccount, GlobalSettings)
- Query key `['saas', 'userProfile']` is intentionally shared with `SidebarUserAccount` to leverage cache
- `staleTime: 60_000` — consistent with existing usage, no redundant requests
- **Loading state**: `isVideoLocked` defaults to `false` to avoid flash
- **Error / null state**: if `profileQuery` errors or returns `null`, treat as unlocked (fail open) — avoids blocking users due to transient network issues
- **New import**: `useQuery` from `@tanstack/react-query` (not currently imported in VideoAiPanel)
- **PricingDialog state**: `useState<boolean>` for `pricingOpen`, rendered alongside the lock overlay

## Lock Screen UI

Container matches normal panel dimensions: `w-[420px] rounded-3xl border bg-card`.

```
┌─────────────────────────────────┐
│                                 │
│          Lock icon (24px)       │
│                                 │
│   videoLocked.title             │
│   videoLocked.description       │
│                                 │
│     [ videoLocked.upgrade ]     │
│                                 │
└─────────────────────────────────┘
```

- Lock icon: `lucide-react` `Lock` component
- Upgrade button: `rounded-full bg-foreground text-background hover:bg-foreground/90`
- Button opens `PricingDialog` (existing component from `@/components/billing/PricingDialog`)

## i18n Keys

Namespace: `board`. New key group: `videoLocked`.

| Key | zh-CN | en-US | zh-TW | ja-JP |
|-----|-------|-------|-------|-------|
| `videoLocked.title` | 视频生成需要 Pro 及以上套餐 | Video generation requires Pro plan or above | 影片生成需要 Pro 及以上方案 | 動画生成にはProプラン以上が必要です |
| `videoLocked.description` | 升级后即可使用全部视频功能 | Upgrade to unlock all video features | 升級後即可使用全部影片功能 | アップグレードして全ての動画機能をご利用ください |
| `videoLocked.upgrade` | 升级套餐 | Upgrade | 升級方案 | アップグレード |

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/components/board/panels/VideoAiPanel.tsx` | Add membership check + lock overlay + PricingDialog |
| `apps/web/src/i18n/locales/zh-CN/board.json` | Add `videoLocked` keys |
| `apps/web/src/i18n/locales/en-US/board.json` | Add `videoLocked` keys |
| `apps/web/src/i18n/locales/zh-TW/board.json` | Add `videoLocked` keys |
| `apps/web/src/i18n/locales/ja-JP/board.json` | Add `videoLocked` keys |

## What Does NOT Change

- Backend capabilities API — no filtering changes
- GenerateActionBar — no changes
- ImageAiPanel / AudioAiPanel — not affected
- Unauthenticated user flow — preserved as-is

## Future Extensibility

Currently only VideoAiPanel is gated. If Audio or Image panels need the same gate later, the `isVideoLocked` logic (3 lines) can be extracted into a shared `useMembershipGate(minLevel)` hook. For now, inline is sufficient.
