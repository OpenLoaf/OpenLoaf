# Account & Subscription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subscription management, payment embeds, and credits transaction history to the OpenLoaf client.

**Architecture:** New settings panel "Subscription" with SDK iframe embeds in Dialogs for payment. Data fetched from SaaS tRPC API via raw fetch. Entry points in settings menu and sidebar dropdown.

**Tech Stack:** React 19, `@openloaf-saas/sdk` (createPricingEmbed/createRechargeEmbed), TanStack React Query, react-i18next, Zustand

**Spec:** `docs/superpowers/specs/2026-03-23-account-subscription-design.md`

---

### Task 1: Add i18n keys (4 languages)

**Files:**
- Modify: `apps/web/src/i18n/locales/zh-CN/settings.json`
- Modify: `apps/web/src/i18n/locales/zh-TW/settings.json`
- Modify: `apps/web/src/i18n/locales/en-US/settings.json`
- Modify: `apps/web/src/i18n/locales/ja-JP/settings.json`

- [ ] **Step 1: Add menu key and account namespace to zh-CN**

In `zh-CN/settings.json`, add `"subscription"` to the `"menu"` object:
```json
"subscription": "订阅"
```

Add new top-level `"account"` object:
```json
"account": {
  "subscription": "订阅状态",
  "currentPlan": "当前套餐",
  "period": "计费周期",
  "expiresAt": "到期时间",
  "creditsQuota": "积分额度",
  "creditsUsed": "已用积分",
  "noSubscription": "暂无订阅，当前为免费版",
  "upgrade": "升级套餐",
  "recharge": "充值积分",
  "transactions": "积分记录",
  "transactionType": "类型",
  "allTypes": "全部",
  "transactionAmount": "积分变动",
  "transactionBalance": "变动后余额",
  "transactionTime": "时间",
  "transactionDescription": "说明",
  "noTransactions": "暂无积分记录",
  "loadMore": "加载更多",
  "loading": "加载中...",
  "loadError": "加载失败，请重试",
  "paymentSuccess": "支付成功，积分已到账",
  "paymentCancelled": "支付已取消",
  "embedTimeout": "页面加载超时，请重试",
  "saasUrlMissing": "SaaS 服务未配置",
  "plan": {
    "free": "免费版",
    "lite": "轻享版",
    "pro": "专业版",
    "premium": "旗舰版",
    "infinity": "无限版"
  },
  "periodLabel": {
    "monthly": "月付",
    "yearly": "年付"
  },
  "txType": {
    "consumption": "消费",
    "recharge": "充值",
    "deduction": "扣减",
    "grant": "赠送",
    "refund": "退款"
  }
}
```

- [ ] **Step 2: Add corresponding keys to en-US**

Same structure in `en-US/settings.json`:
```json
"menu.subscription": "Subscription"
```

```json
"account": {
  "subscription": "Subscription",
  "currentPlan": "Current Plan",
  "period": "Billing Period",
  "expiresAt": "Expires",
  "creditsQuota": "Credits Quota",
  "creditsUsed": "Credits Used",
  "noSubscription": "No subscription — currently on Free plan",
  "upgrade": "Upgrade",
  "recharge": "Recharge",
  "transactions": "Credits History",
  "transactionType": "Type",
  "allTypes": "All",
  "transactionAmount": "Amount",
  "transactionBalance": "Balance After",
  "transactionTime": "Time",
  "transactionDescription": "Description",
  "noTransactions": "No transaction records",
  "loadMore": "Load More",
  "loading": "Loading...",
  "loadError": "Failed to load, please retry",
  "paymentSuccess": "Payment successful, credits added",
  "paymentCancelled": "Payment cancelled",
  "embedTimeout": "Page load timed out, please retry",
  "saasUrlMissing": "SaaS service not configured",
  "plan": {
    "free": "Free",
    "lite": "Lite",
    "pro": "Pro",
    "premium": "Premium",
    "infinity": "Infinity"
  },
  "periodLabel": {
    "monthly": "Monthly",
    "yearly": "Yearly"
  },
  "txType": {
    "consumption": "Consumption",
    "recharge": "Recharge",
    "deduction": "Deduction",
    "grant": "Grant",
    "refund": "Refund"
  }
}
```

- [ ] **Step 3: Add corresponding keys to zh-TW**

```json
"menu.subscription": "訂閱"
```

```json
"account": {
  "subscription": "訂閱狀態",
  "currentPlan": "目前方案",
  "period": "計費週期",
  "expiresAt": "到期時間",
  "creditsQuota": "積分額度",
  "creditsUsed": "已用積分",
  "noSubscription": "尚無訂閱，目前為免費版",
  "upgrade": "升級方案",
  "recharge": "儲值積分",
  "transactions": "積分紀錄",
  "transactionType": "類型",
  "allTypes": "全部",
  "transactionAmount": "積分變動",
  "transactionBalance": "變動後餘額",
  "transactionTime": "時間",
  "transactionDescription": "說明",
  "noTransactions": "尚無積分紀錄",
  "loadMore": "載入更多",
  "loading": "載入中...",
  "loadError": "載入失敗，請重試",
  "paymentSuccess": "付款成功，積分已到帳",
  "paymentCancelled": "付款已取消",
  "embedTimeout": "頁面載入逾時，請重試",
  "saasUrlMissing": "SaaS 服務未設定",
  "plan": {
    "free": "免費版",
    "lite": "輕享版",
    "pro": "專業版",
    "premium": "旗艦版",
    "infinity": "無限版"
  },
  "periodLabel": {
    "monthly": "月付",
    "yearly": "年付"
  },
  "txType": {
    "consumption": "消費",
    "recharge": "儲值",
    "deduction": "扣減",
    "grant": "贈送",
    "refund": "退款"
  }
}
```

- [ ] **Step 4: Add corresponding keys to ja-JP**

```json
"menu.subscription": "サブスクリプション"
```

```json
"account": {
  "subscription": "サブスクリプション",
  "currentPlan": "現在のプラン",
  "period": "請求サイクル",
  "expiresAt": "有効期限",
  "creditsQuota": "クレジット枠",
  "creditsUsed": "使用済みクレジット",
  "noSubscription": "サブスクリプションなし — 現在フリープラン",
  "upgrade": "アップグレード",
  "recharge": "チャージ",
  "transactions": "クレジット履歴",
  "transactionType": "種類",
  "allTypes": "すべて",
  "transactionAmount": "変動額",
  "transactionBalance": "変動後残高",
  "transactionTime": "日時",
  "transactionDescription": "説明",
  "noTransactions": "取引記録なし",
  "loadMore": "さらに読み込む",
  "loading": "読み込み中...",
  "loadError": "読み込み失敗、再試行してください",
  "paymentSuccess": "お支払い完了、クレジットが追加されました",
  "paymentCancelled": "お支払いがキャンセルされました",
  "embedTimeout": "ページ読み込みタイムアウト、再試行してください",
  "saasUrlMissing": "SaaSサービス未設定",
  "plan": {
    "free": "フリー",
    "lite": "ライト",
    "pro": "プロ",
    "premium": "プレミアム",
    "infinity": "インフィニティ"
  },
  "periodLabel": {
    "monthly": "月額",
    "yearly": "年額"
  },
  "txType": {
    "consumption": "消費",
    "recharge": "チャージ",
    "deduction": "差引",
    "grant": "付与",
    "refund": "返金"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n/locales/
git commit -m "feat(i18n): add account subscription i18n keys for 4 languages"
```

---

### Task 2: Add SaaS data fetching functions

**Files:**
- Modify: `apps/web/src/lib/saas-auth.ts`

**Reference:** Existing `fetchUserProfile()` at line 328-347 for pattern.

- [ ] **Step 1: Add `fetchCurrentSubscription()`**

Add after `fetchUserProfile()` in `saas-auth.ts`:

```typescript
/** Fetch current active subscription from SaaS backend. */
export async function fetchCurrentSubscription(): Promise<{
  id: string
  planCode: string
  period: "monthly" | "yearly"
  status: "active" | "expired" | "cancelled"
  creditsQuota: number
  creditsUsed: number
  currentPeriodStart: string
  currentPeriodEnd: string
} | null> {
  const token = await getAccessToken()
  if (!token) return null
  try {
    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) return null
    const url = `${baseUrl}/api/trpc/memberSubscription.current`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    // tRPC without transformer: { result: { data: <actual> } }
    return json?.result?.data ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Add `fetchCreditsTransactions()`**

Add after `fetchCurrentSubscription()`:

```typescript
/** Fetch credits transaction list from SaaS backend. */
export async function fetchCreditsTransactions(input: {
  page: number
  pageSize: number
  type?: string
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
} | null> {
  const token = await getAccessToken()
  if (!token) return null
  try {
    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) return null
    const inputParam = encodeURIComponent(JSON.stringify(input))
    const url = `${baseUrl}/api/trpc/memberCredits.transactions?input=${inputParam}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    // tRPC without transformer: { result: { data: <actual> } }
    return json?.result?.data ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/saas-auth.ts
git commit -m "feat(web): add fetchCurrentSubscription and fetchCreditsTransactions"
```

---

### Task 3: Create Billing Dialog components

**Files:**
- Create: `apps/web/src/components/billing/PricingDialog.tsx`
- Create: `apps/web/src/components/billing/RechargeDialog.tsx`

- [ ] **Step 1: Create `PricingDialog.tsx`**

```typescript
"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { createPricingEmbed } from "@openloaf-saas/sdk"
import type { EmbedInstance } from "@openloaf-saas/sdk"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
} from "@openloaf/ui/dialog"
import { Button } from "@openloaf/ui/button"
import { resolveSaasBaseUrl, getAccessToken } from "@/lib/saas-auth"
import { queryClient } from "@/utils/trpc"

type PricingDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMBED_TIMEOUT_MS = 15_000
const TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000

export function PricingDialog({ open, onOpenChange }: PricingDialogProps) {
  const { t } = useTranslation("settings")
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<EmbedInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [timedOut, setTimedOut] = useState(false)

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open || !containerRef.current) return

    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) {
      toast.error(t("account.saasUrlMissing"))
      handleClose()
      return
    }

    let destroyed = false
    setLoading(true)
    setTimedOut(false)

    const timeoutId = setTimeout(() => {
      if (!destroyed) setTimedOut(true)
    }, EMBED_TIMEOUT_MS)

    void getAccessToken().then((token) => {
      if (destroyed || !token || !containerRef.current) return

      const embed = createPricingEmbed({
        container: containerRef.current,
        baseUrl,
        token,
        onReady: () => {
          clearTimeout(timeoutId)
          if (!destroyed) setLoading(false)
        },
        onSuccess: () => {
          toast.success(t("account.paymentSuccess"))
          void queryClient.invalidateQueries({ queryKey: ["saas"] })
          handleClose()
        },
        onCancel: () => {
          toast.info(t("account.paymentCancelled"))
          handleClose()
        },
        onClose: () => handleClose(),
        style: { width: "100%", height: "100%", border: "none" },
      })
      embedRef.current = embed
    })

    // Token refresh interval
    const refreshInterval = setInterval(() => {
      void getAccessToken().then((newToken) => {
        if (newToken && embedRef.current) {
          embedRef.current.updateToken(newToken)
        }
      })
    }, TOKEN_REFRESH_INTERVAL_MS)

    return () => {
      destroyed = true
      clearTimeout(timeoutId)
      clearInterval(refreshInterval)
      embedRef.current?.destroy()
      embedRef.current = null
    }
  }, [open, t, handleClose])

  const handleRetry = () => {
    setTimedOut(false)
    setLoading(true)
    embedRef.current?.destroy()
    embedRef.current = null
    // Force re-mount by toggling open
    onOpenChange(false)
    setTimeout(() => onOpenChange(true), 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[80vh] max-w-2xl p-0 overflow-hidden rounded-3xl shadow-none border-border/60">
        <div className="relative h-full w-full">
          <div ref={containerRef} className="h-full w-full" />
          {loading && !timedOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {timedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
              <p className="text-sm text-muted-foreground">{t("account.embedTimeout")}</p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-3xl"
                onClick={handleRetry}
              >
                {t("account.loadError")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `RechargeDialog.tsx`**

Same structure, but uses `createRechargeEmbed`:

```typescript
"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { createRechargeEmbed } from "@openloaf-saas/sdk"
import type { EmbedInstance } from "@openloaf-saas/sdk"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
} from "@openloaf/ui/dialog"
import { Button } from "@openloaf/ui/button"
import { resolveSaasBaseUrl, getAccessToken } from "@/lib/saas-auth"
import { queryClient } from "@/utils/trpc"

type RechargeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMBED_TIMEOUT_MS = 15_000
const TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000

export function RechargeDialog({ open, onOpenChange }: RechargeDialogProps) {
  const { t } = useTranslation("settings")
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<EmbedInstance | null>(null)
  const [loading, setLoading] = useState(true)
  const [timedOut, setTimedOut] = useState(false)

  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  useEffect(() => {
    if (!open || !containerRef.current) return

    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) {
      toast.error(t("account.saasUrlMissing"))
      handleClose()
      return
    }

    let destroyed = false
    setLoading(true)
    setTimedOut(false)

    const timeoutId = setTimeout(() => {
      if (!destroyed) setTimedOut(true)
    }, EMBED_TIMEOUT_MS)

    void getAccessToken().then((token) => {
      if (destroyed || !token || !containerRef.current) return

      const embed = createRechargeEmbed({
        container: containerRef.current,
        baseUrl,
        token,
        onReady: () => {
          clearTimeout(timeoutId)
          if (!destroyed) setLoading(false)
        },
        onSuccess: () => {
          toast.success(t("account.paymentSuccess"))
          void queryClient.invalidateQueries({ queryKey: ["saas"] })
          handleClose()
        },
        onCancel: () => {
          toast.info(t("account.paymentCancelled"))
          handleClose()
        },
        onClose: () => handleClose(),
        style: { width: "100%", height: "100%", border: "none" },
      })
      embedRef.current = embed
    })

    const refreshInterval = setInterval(() => {
      void getAccessToken().then((newToken) => {
        if (newToken && embedRef.current) {
          embedRef.current.updateToken(newToken)
        }
      })
    }, TOKEN_REFRESH_INTERVAL_MS)

    return () => {
      destroyed = true
      clearTimeout(timeoutId)
      clearInterval(refreshInterval)
      embedRef.current?.destroy()
      embedRef.current = null
    }
  }, [open, t, handleClose])

  const handleRetry = () => {
    setTimedOut(false)
    setLoading(true)
    embedRef.current?.destroy()
    embedRef.current = null
    onOpenChange(false)
    setTimeout(() => onOpenChange(true), 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[80vh] max-w-2xl p-0 overflow-hidden rounded-3xl shadow-none border-border/60">
        <div className="relative h-full w-full">
          <div ref={containerRef} className="h-full w-full" />
          {loading && !timedOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {timedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background">
              <p className="text-sm text-muted-foreground">{t("account.embedTimeout")}</p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-3xl"
                onClick={handleRetry}
              >
                {t("account.loadError")}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/billing/
git commit -m "feat(web): add PricingDialog and RechargeDialog with SDK embeds"
```

---

### Task 4: Create SubscriptionSettings panel

**Files:**
- Create: `apps/web/src/components/setting/menus/SubscriptionSettings.tsx`

**Reference:** `apps/web/src/components/setting/menus/GlobalSettings.tsx` for structure pattern (OpenLoafSettingsGroup, OpenLoafSettingsField, SettingIcon).

- [ ] **Step 1: Create `SubscriptionSettings.tsx`**

```typescript
"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import {
  Crown,
  Sparkles,
  CreditCard,
  Calendar,
  Receipt,
  ChevronDown,
} from "lucide-react"
import { Button } from "@openloaf/ui/button"
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField"
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup"
import { useSaasAuth } from "@/hooks/use-saas-auth"
import {
  fetchUserProfile,
  fetchCurrentSubscription,
  fetchCreditsTransactions,
} from "@/lib/saas-auth"
import { PricingDialog } from "@/components/billing/PricingDialog"
import { RechargeDialog } from "@/components/billing/RechargeDialog"

const TX_PAGE_SIZE = 15

const TX_TYPES = [
  "consumption",
  "recharge",
  "deduction",
  "grant",
  "refund",
] as const

function SettingIcon({
  icon: Icon,
  bg,
  fg,
}: {
  icon: React.ComponentType<{ className?: string }>
  bg: string
  fg: string
}) {
  return (
    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${bg}`}>
      <Icon className={`h-3 w-3 ${fg}`} />
    </div>
  )
}

export function SubscriptionSettings() {
  const { t } = useTranslation("settings")
  const { loggedIn } = useSaasAuth()

  const [pricingOpen, setPricingOpen] = useState(false)
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const [txTypeFilter, setTxTypeFilter] = useState<string | undefined>(undefined)

  const profileQuery = useQuery({
    queryKey: ["saas", "userProfile"],
    queryFn: fetchUserProfile,
    enabled: loggedIn,
    staleTime: 60_000,
  })

  const subscriptionQuery = useQuery({
    queryKey: ["saas", "subscription"],
    queryFn: fetchCurrentSubscription,
    enabled: loggedIn,
    staleTime: 30_000,
  })

  const transactionsQuery = useInfiniteQuery({
    queryKey: ["saas", "creditsTransactions", { type: txTypeFilter }],
    queryFn: ({ pageParam = 1 }) =>
      fetchCreditsTransactions({
        page: pageParam,
        pageSize: TX_PAGE_SIZE,
        type: txTypeFilter,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage) return undefined
      const loaded = lastPageParam * TX_PAGE_SIZE
      return loaded < lastPage.total ? lastPageParam + 1 : undefined
    },
    enabled: loggedIn,
    staleTime: 30_000,
  })

  const sub = subscriptionQuery.data
  const allTx = transactionsQuery.data?.pages.flatMap((p) => p?.items ?? []) ?? []

  const planLabels: Record<string, string> = {
    free: t("account.plan.free"),
    lite: t("account.plan.lite"),
    pro: t("account.plan.pro"),
    premium: t("account.plan.premium"),
    infinity: t("account.plan.infinity"),
  }

  const txTypeLabels: Record<string, string> = {
    consumption: t("account.txType.consumption"),
    recharge: t("account.txType.recharge"),
    deduction: t("account.txType.deduction"),
    grant: t("account.txType.grant"),
    refund: t("account.txType.refund"),
  }

  if (!loggedIn) return null

  return (
    <div className="space-y-6">
      {/* Subscription Status */}
      <OpenLoafSettingsGroup title={t("account.subscription")}>
        <div className="divide-y divide-border/40">
          {sub && sub.status === "active" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 py-3">
                <SettingIcon icon={Crown} bg="bg-secondary" fg="text-foreground" />
                <div className="text-sm font-medium">{t("account.currentPlan")}</div>
                <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
                  {planLabels[sub.planCode] ?? sub.planCode}
                </OpenLoafSettingsField>
              </div>
              <div className="flex flex-wrap items-center gap-2 py-3">
                <SettingIcon icon={CreditCard} bg="bg-secondary" fg="text-foreground" />
                <div className="text-sm font-medium">{t("account.period")}</div>
                <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
                  {t(`account.periodLabel.${sub.period}`)}
                </OpenLoafSettingsField>
              </div>
              <div className="flex flex-wrap items-center gap-2 py-3">
                <SettingIcon icon={Calendar} bg="bg-secondary" fg="text-foreground" />
                <div className="text-sm font-medium">{t("account.expiresAt")}</div>
                <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </OpenLoafSettingsField>
              </div>
              <div className="flex flex-wrap items-center gap-2 py-3">
                <SettingIcon icon={Sparkles} bg="bg-secondary" fg="text-foreground" />
                <div className="text-sm font-medium">{t("account.creditsQuota")}</div>
                <OpenLoafSettingsField className="text-right text-xs text-muted-foreground">
                  {Math.floor(sub.creditsUsed).toLocaleString()} / {Math.floor(sub.creditsQuota).toLocaleString()}
                </OpenLoafSettingsField>
              </div>
            </>
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {subscriptionQuery.isLoading ? t("account.loading") : t("account.noSubscription")}
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-3">
          <Button
            size="sm"
            className="rounded-3xl shadow-none"
            onClick={() => setPricingOpen(true)}
          >
            {t("account.upgrade")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-3xl shadow-none"
            onClick={() => setRechargeOpen(true)}
          >
            {t("account.recharge")}
          </Button>
        </div>
      </OpenLoafSettingsGroup>

      {/* Credits Transaction History */}
      <OpenLoafSettingsGroup title={t("account.transactions")}>
        {/* Type filter */}
        <div className="flex gap-1.5 pb-3">
          <Button
            size="sm"
            variant={txTypeFilter === undefined ? "default" : "outline"}
            className="h-7 rounded-3xl px-2.5 text-xs shadow-none"
            onClick={() => setTxTypeFilter(undefined)}
          >
            {t("account.allTypes")}
          </Button>
          {TX_TYPES.map((type) => (
            <Button
              key={type}
              size="sm"
              variant={txTypeFilter === type ? "default" : "outline"}
              className="h-7 rounded-3xl px-2.5 text-xs shadow-none"
              onClick={() => setTxTypeFilter(type)}
            >
              {txTypeLabels[type]}
            </Button>
          ))}
        </div>

        {/* Transaction list */}
        <div className="divide-y divide-border/40">
          {allTx.length === 0 && !transactionsQuery.isLoading && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {transactionsQuery.isError
                ? t("account.loadError")
                : t("account.noTransactions")}
            </div>
          )}
          {allTx.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-2.5">
              <SettingIcon icon={Receipt} bg="bg-secondary" fg="text-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {txTypeLabels[tx.type] ?? tx.type}
                    {tx.kind ? ` · ${tx.kind}` : ""}
                  </span>
                </div>
                {tx.description && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {tx.description}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-xs font-medium ${tx.amount >= 0 ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                  {tx.amount >= 0 ? "+" : ""}{Math.floor(tx.amount).toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(tx.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Load more */}
        {transactionsQuery.hasNextPage && (
          <div className="flex justify-center pt-3">
            <Button
              size="sm"
              variant="ghost"
              className="rounded-3xl text-xs"
              disabled={transactionsQuery.isFetchingNextPage}
              onClick={() => void transactionsQuery.fetchNextPage()}
            >
              <ChevronDown className="mr-1 size-3" />
              {transactionsQuery.isFetchingNextPage
                ? t("account.loading")
                : t("account.loadMore")}
            </Button>
          </div>
        )}

        {transactionsQuery.isLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {t("account.loading")}
          </div>
        )}
      </OpenLoafSettingsGroup>

      <PricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />
      <RechargeDialog open={rechargeOpen} onOpenChange={setRechargeOpen} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/setting/menus/SubscriptionSettings.tsx
git commit -m "feat(web): add SubscriptionSettings panel"
```

---

### Task 5: Register subscription menu in SettingsPage

**Files:**
- Modify: `apps/web/src/components/setting/SettingsPage.tsx`

- [ ] **Step 1: Add import and menu key**

In `SettingsPage.tsx`:

1. Add import:
```typescript
import { SubscriptionSettings } from "./menus/SubscriptionSettings"
```

2. Add `CreditCard` to lucide-react import.

3. Add `"subscription"` to `SettingsMenuKey` union type.

4. Add to `SETTINGS_MENU_ICON_COLOR`:
```typescript
subscription: "text-foreground",
```

5. Add to `ALL_MENU_KEYS` array: `'subscription'`

- [ ] **Step 2: Add menu item in `buildMenu()`**

Insert after the `global` entry (line ~129), before `shortcuts`:

```typescript
{
  key: "subscription",
  label: t('settings:menu.subscription'),
  Icon: createMenuIcon(CreditCard, SETTINGS_MENU_ICON_COLOR.subscription),
  Component: SubscriptionSettings,
},
```

- [ ] **Step 3: Add to `menuGroups` general group**

In the `menuGroups` useMemo, add `byKey.get("subscription")` after `byKey.get("global")`:

```typescript
const general = [
  byKey.get("basic"),
  byKey.get("global"),
  byKey.get("subscription"),  // NEW
  byKey.get("shortcuts"),
  // ... rest
```

- [ ] **Step 4: Conditionally hide when not logged in**

1. Change `buildMenu` signature to accept `loggedIn`:
```typescript
function buildMenu(t: (key: string) => string, loggedIn: boolean): Array<{...}>
```

2. Wrap the subscription entry:
```typescript
...(loggedIn ? [{
  key: "subscription" as SettingsMenuKey,
  label: t('settings:menu.subscription'),
  Icon: createMenuIcon(CreditCard, SETTINGS_MENU_ICON_COLOR.subscription),
  Component: SubscriptionSettings,
}] : []),
```

3. Add `useSaasAuth` import and hook call in `SettingsPage`:
```typescript
import { useSaasAuth } from "@/hooks/use-saas-auth"
```

Inside the component:
```typescript
const { loggedIn } = useSaasAuth()
```

4. Update the `MENU` useMemo call site:
```typescript
const MENU = useMemo(() => buildMenu((key) => t(key), loggedIn), [t, loggedIn]);
```

5. Handle persisted `"subscription"` key when logged out — in `normalizeSettingsMenuKey`, the key is valid but the menu item won't exist, so the component falls back gracefully since `MENU.find()` returns undefined and `activeItem` will be null. Add a guard: if `activeKey` doesn't exist in current `MENU`, fall back to `"basic"`:
```typescript
// After MENU is computed, inside a useEffect:
useEffect(() => {
  if (!MENU.some((item) => item.key === activeKey)) {
    setActiveKey("basic")
  }
}, [MENU, activeKey])
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/setting/SettingsPage.tsx
git commit -m "feat(web): register subscription menu in SettingsPage"
```

---

### Task 6: Add sidebar dropdown menu items

**Files:**
- Modify: `apps/web/src/components/layout/sidebar/SidebarUserAccount.tsx`

- [ ] **Step 1: Add imports**

Add to imports:
```typescript
import { CreditCard } from "lucide-react"
import { PricingDialog } from "@/components/billing/PricingDialog"
```

- [ ] **Step 2: Add translation hook and state to `SidebarUserAccount`**

Inside `SidebarUserAccount()`, add a second translation hook for the settings namespace, and dialog state:
```typescript
const { t: tSettings } = useTranslation('settings')
const [pricingOpen, setPricingOpen] = React.useState(false)
```

- [ ] **Step 3: Add "Upgrade/Recharge" DropdownMenuItem**

In the `<div className="space-y-1">` block, after the feedback item and before the update check item, add (inside the `authLoggedIn` check):

```tsx
{authLoggedIn && (
  <DropdownMenuItem
    onSelect={() => setPricingOpen(true)}
    className="rounded-3xl"
  >
    <CreditCard className="size-4" />
    {tSettings('account.upgrade')}
  </DropdownMenuItem>
)}
```

Note: Use `tSettings('account.upgrade')` — NOT `t('upgrade')` which would look in `project:global` namespace.

- [ ] **Step 4: Add PricingDialog render**

Right after `<SaasLoginDialog>`, add:
```tsx
<PricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />
```

- [ ] **Step 5: Apply same changes to `CompactUserAvatar`**

Same pattern: add `tSettings` hook, `pricingOpen` state, `CreditCard` DropdownMenuItem, and `PricingDialog` render.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/layout/sidebar/SidebarUserAccount.tsx
git commit -m "feat(web): add upgrade/recharge menu item to sidebar dropdown"
```

---

### Task 7: Verify and fix build

**Files:** All modified files

- [ ] **Step 1: Run type check**

```bash
cd /Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf && pnpm run check-types
```

Fix any TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
pnpm run lint:biome:fix
```

Fix any lint issues.

- [ ] **Step 3: Run dev build to verify**

```bash
pnpm run build
```

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(web): fix build issues in account subscription feature"
```
