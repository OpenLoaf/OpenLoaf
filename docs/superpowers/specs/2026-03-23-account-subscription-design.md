# Account & Subscription — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add account & subscription management to OpenLoaf client. Users can view their membership level, credits balance, subscription status, and credits transaction history. Payment (subscribe/recharge) is handled via SDK iframe embeds in Dialogs — users never leave the app.

No admin panel. Credits transaction records are fetched in real-time from the SaaS API.

## Approach

**Iframe embed in Dialog** — Use SDK's `createPricingEmbed()` / `createRechargeEmbed()` to render SaaS payment pages inside a Dialog. Event callbacks (`onSuccess`, `onCancel`, `onClose`) handle post-payment state refresh.

## Menu Naming

The existing `"global"` menu item is already labeled "Account" (账户) in all locales. To avoid confusion, the new panel uses key `"subscription"` with label **"Subscription"** (订阅). The existing `GlobalSettings` retains its "Account" label and continues to show basic account info (membership level, credits balance). The new panel focuses on subscription management, payment, and transaction history.

## Entry Points

1. **Settings page** — New "Subscription" menu item (Group 1, after `global`). Only visible when SaaS-logged-in.
2. **Sidebar DropdownMenu** — Add "Upgrade/Recharge" and "Transaction History" menu items (only when logged in). No click interception on the credits `<span>` within the dropdown trigger — keep existing click behavior intact.

## New Components

### `SubscriptionSettings.tsx` (Settings panel)

Sections:
- **Subscription status**: Current plan, period, expiry date, credits quota/used (from `fetchCurrentSubscription()`)
- **Action buttons**: "Upgrade" → PricingDialog, "Recharge" → RechargeDialog
- **Credits transaction history**: Paginated table with type filter (from `fetchCreditsTransactions()`)

Uses `useInfiniteQuery` with page size 15 and "Load more" button for pagination.

### `PricingDialog.tsx`

- Renders SDK `createPricingEmbed({ container, baseUrl, token, onSuccess, onCancel, onClose, onReady })` inside a Dialog
- Shows loading spinner until `onReady` fires
- On `onSuccess`: invalidate all `["saas"]` queries, toast `t('account.paymentSuccess')`, close dialog
- On `onCancel`: toast `t('account.paymentCancelled')`, close dialog
- On `onClose`: close dialog silently
- Token refresh: `useEffect` with 4-minute interval calls `getAccessToken()` and `embed.updateToken()`

### `RechargeDialog.tsx`

- Same pattern as PricingDialog but uses `createRechargeEmbed()`

## Data Fetching

### Existing (reuse)

```typescript
// saas-auth.ts — already implemented
fetchUserProfile(): Promise<{ id, membershipLevel, creditsBalance } | null>
```

### New functions (add to `saas-auth.ts`)

```typescript
// Fetch current active subscription from SaaS tRPC API
fetchCurrentSubscription(): Promise<{
  id: string
  planCode: string
  period: "monthly" | "yearly"
  status: "active" | "expired" | "cancelled"
  creditsQuota: number
  creditsUsed: number
  currentPeriodStart: string
  currentPeriodEnd: string
} | null>

// Fetch credits transaction list from SaaS tRPC API
fetchCreditsTransactions(input: {
  page: number
  pageSize: number
  type?: "consumption" | "recharge" | "deduction" | "grant" | "refund"
}): Promise<{
  items: Array<{
    id: string
    type: string
    kind: string | null
    amount: number
    balanceAfter: number
    description: string
    createdAt: string
  }>
  total: number
} | null>
```

Implementation: Direct `fetch()` to SaaS tRPC HTTP endpoints with Bearer token. The SDK does not expose typed client methods for `memberSubscription` or `memberCredits`, so raw fetch to `${saasBaseUrl}/api/trpc/<procedure>` is required. Use `superjson` for deserialization to match the SaaS tRPC server's transformer.

### Query Keys

| Data | Query Key | staleTime |
|------|-----------|-----------|
| User profile | `["saas", "userProfile"]` | 60s (existing) |
| Subscription | `["saas", "subscription"]` | 30s |
| Transactions | `["saas", "creditsTransactions", { page, type }]` | 30s |

On payment `onSuccess`, invalidate all queries prefixed with `["saas"]`.

## Settings Page Changes

### `SettingsPage.tsx`

- Add `"subscription"` to `SettingsMenuKey` union
- Add menu item with `CreditCard` icon, label from `t('settings:menu.subscription')`
- Place in Group 1 after `global`, before `shortcuts`
- Conditionally include: only when SaaS auth is logged in (pass `loggedIn` into `buildMenu()`)

### `SidebarUserAccount.tsx`

Both `SidebarUserAccount` and `CompactUserAvatar`:
- Add "Upgrade/Recharge" `DropdownMenuItem` with `CreditCard` icon → opens PricingDialog (only when logged in)
- Add "Transaction History" `DropdownMenuItem` with `Receipt` icon → navigates to settings subscription panel (only when logged in)
- Do NOT modify the credits `<span>` click behavior — it stays as display-only within the trigger

## Embed Error Handling

- Show a centered loading spinner in the Dialog until `onReady` fires
- If `onReady` doesn't fire within 15 seconds, show an error message with a "Retry" button
- If `resolveSaasBaseUrl()` returns empty, show a toast error and don't open the Dialog

## i18n Keys

Namespace: `settings` (existing file)

New keys:
- `menu.subscription` — menu label ("Subscription" / "订阅")
- `account.subscription` — section title
- `account.currentPlan` — field label
- `account.period` — field label
- `account.expiresAt` — field label
- `account.creditsQuota` — field label
- `account.creditsUsed` — field label
- `account.noSubscription` — empty state (free user)
- `account.upgrade` — button
- `account.recharge` — button
- `account.transactions` — section title
- `account.transactionType` — filter label
- `account.allTypes` — filter "all" option
- `account.transactionAmount` — column
- `account.transactionBalance` — column
- `account.transactionTime` — column
- `account.transactionDescription` — column
- `account.noTransactions` — empty state
- `account.loadMore` — pagination button
- `account.loading` — loading state
- `account.loadError` — error state
- `account.paymentSuccess` — toast
- `account.paymentCancelled` — toast
- `account.embedTimeout` — embed load timeout error
- `account.saasUrlMissing` — SaaS URL not configured error
- Plan labels: `account.plan.free`, `account.plan.lite`, `account.plan.pro`, `account.plan.premium`, `account.plan.infinity`
- Period labels: `account.period.monthly`, `account.period.yearly`
- Transaction type labels: `account.txType.consumption`, `account.txType.recharge`, `account.txType.deduction`, `account.txType.grant`, `account.txType.refund`

Languages: zh-CN, zh-TW, en-US, ja-JP

## File Structure

```
apps/web/src/
├── lib/saas-auth.ts                          # +fetchCreditsTransactions, +fetchCurrentSubscription
├── components/setting/
│   ├── SettingsPage.tsx                      # +subscription menu item
│   └── menus/SubscriptionSettings.tsx        # NEW
├── components/billing/
│   ├── PricingDialog.tsx                     # NEW
│   └── RechargeDialog.tsx                    # NEW
├── components/layout/sidebar/
│   └── SidebarUserAccount.tsx                # Modified (dropdown items)
└── i18n/locales/
    ├── zh-CN/settings.json                   # +account keys
    ├── zh-TW/settings.json
    ├── en-US/settings.json
    └── ja-JP/settings.json
```

## Dependencies

- `@openloaf-saas/sdk` — `createPricingEmbed`, `createRechargeEmbed` (already installed)
- No new npm packages needed
- No database schema changes
- No server-side changes

## Constraints

- Subscription menu only visible when SaaS-logged-in
- Embed iframe needs `resolveSaasBaseUrl()` to be configured (guard with check)
- Token passed to embed must be kept fresh via `updateToken()` (4-min interval)
- Electron CSP must allow framing `saasBaseUrl` — verify in Electron config
