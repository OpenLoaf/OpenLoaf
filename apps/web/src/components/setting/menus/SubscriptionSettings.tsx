/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useInfiniteQuery, useMutation } from "@tanstack/react-query"
import {
  Crown,
  Sparkles,
  CreditCard,
  Calendar,
  Receipt,
  ChevronDown,
  Ticket,
} from "lucide-react"
import { SaaSHttpError } from "@openloaf-saas/sdk"
import { Button } from "@openloaf/ui/button"
import { Input } from "@openloaf/ui/input"
import { OpenLoafSettingsField } from "@openloaf/ui/openloaf/OpenLoafSettingsField"
import { OpenLoafSettingsGroup } from "@openloaf/ui/openloaf/OpenLoafSettingsGroup"
import { toast } from "sonner"
import { useSaasAuth } from "@/hooks/use-saas-auth"
import {
  fetchUserProfile,
  fetchCurrentSubscription,
  fetchCreditsTransactions,
  fetchRedeemCodeRecords,
  redeemCode,
} from "@/lib/saas-auth"
import { PricingDialog } from "@/components/billing/PricingDialog"
import { RechargeDialog } from "@/components/billing/RechargeDialog"
import { queryClient } from "@/utils/trpc"

const TX_PAGE_SIZE = 15
const REDEEM_RECORD_PAGE_SIZE = 5

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

/**
 * Normalize redeem code text before sending it to SaaS.
 */
function normalizeRedeemCodeInput(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase()
}

/**
 * Resolve a human-readable error message from SaaS HTTP errors.
 */
function getRedeemErrorMessage(error: unknown): string | null {
  if (error instanceof SaaSHttpError) {
    const payload = error.payload as {
      message?: unknown
      error?: unknown
    } | undefined
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message
    }
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error
    }
  }
  if (error instanceof Error && error.message === "not_authenticated") {
    return null
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : null
}

export function SubscriptionSettings() {
  const { t } = useTranslation("settings")
  const { t: tProject } = useTranslation("project", { keyPrefix: "global" })
  const { loggedIn } = useSaasAuth()

  const [pricingOpen, setPricingOpen] = useState(false)
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const [txTypeFilter, setTxTypeFilter] = useState<string | undefined>(undefined)
  const [redeemCodeValue, setRedeemCodeValue] = useState("")

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

  const redeemRecordsQuery = useQuery({
    queryKey: ["saas", "redeemCodeRecords", { page: 1, pageSize: REDEEM_RECORD_PAGE_SIZE }],
    queryFn: () =>
      fetchRedeemCodeRecords({
        page: 1,
        pageSize: REDEEM_RECORD_PAGE_SIZE,
      }),
    enabled: loggedIn,
    staleTime: 30_000,
  })

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => redeemCode({ code }),
    onSuccess: async (result) => {
      setRedeemCodeValue("")
      toast.success(
        t("account.redeemSuccess", {
          credits: Math.floor(result.creditsAmount).toLocaleString(),
          balance: Math.floor(result.newBalance).toLocaleString(),
        }),
      )
      // 逻辑：兑换成功后统一刷新积分余额、兑换记录与积分流水，避免多个区域显示不同步。
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["saas", "userProfile"] }),
        queryClient.invalidateQueries({ queryKey: ["saas", "creditsTransactions"] }),
        queryClient.invalidateQueries({ queryKey: ["saas", "redeemCodeRecords"] }),
      ])
    },
    onError: (error) => {
      toast.error(getRedeemErrorMessage(error) ?? t("account.redeemFailed"))
    },
  })

  const sub = subscriptionQuery.data
  const allTx = transactionsQuery.data?.pages.flatMap((p) => p?.items ?? []) ?? []
  const redeemRecords = redeemRecordsQuery.data?.items ?? []

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

  /**
   * Translate transaction kind labels from backend feature ids.
   */
  const getTxKindLabel = (kind: string | null | undefined) => {
    const normalizedKind = kind?.trim()
    if (!normalizedKind) return null
    return t(`account.txKind.${normalizedKind}`, { defaultValue: normalizedKind })
  }

  if (!loggedIn) return null

  return (
    <div className="space-y-6">
      <OpenLoafSettingsGroup title={tProject("settings.accountInfo")}>
        <div className="divide-y divide-border/40">
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Crown} bg="bg-secondary" fg="text-foreground" />
            <div className="text-sm font-medium">{tProject("settings.membershipLevel")}</div>
            <OpenLoafSettingsField className="gap-2">
              <span className="text-right text-xs text-muted-foreground">
                {profileQuery.isLoading
                  ? tProject("settings.loading")
                  : profileQuery.data?.membershipLevel
                    ? planLabels[profileQuery.data.membershipLevel] ?? profileQuery.data.membershipLevel
                    : "—"}
              </span>
              <Button
                size="sm"
                className="rounded-3xl shadow-none"
                onClick={() => setPricingOpen(true)}
              >
                {t("account.upgrade")}
              </Button>
            </OpenLoafSettingsField>
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <SettingIcon icon={Sparkles} bg="bg-secondary" fg="text-foreground" />
            <div className="text-sm font-medium">{tProject("settings.creditsBalance")}</div>
            <OpenLoafSettingsField className="gap-2">
              <span className="text-right text-xs text-muted-foreground">
                {profileQuery.isLoading
                  ? tProject("settings.loading")
                  : typeof profileQuery.data?.creditsBalance === "number"
                    ? Math.floor(profileQuery.data.creditsBalance).toLocaleString()
                    : "—"}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="rounded-3xl shadow-none"
                onClick={() => setRechargeOpen(true)}
              >
                {t("account.recharge")}
              </Button>
            </OpenLoafSettingsField>
          </div>
        </div>
      </OpenLoafSettingsGroup>

      <OpenLoafSettingsGroup title={t("account.redeemCodeSection")}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const normalizedCode = normalizeRedeemCodeInput(redeemCodeValue)
            if (!normalizedCode) {
              toast.error(t("account.redeemEmpty"))
              return
            }
            redeemMutation.mutate(normalizedCode)
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              value={redeemCodeValue}
              onChange={(event) => setRedeemCodeValue(event.target.value)}
              placeholder={t("account.redeemCodePlaceholder")}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="h-9 rounded-3xl border-border/60 font-mono text-sm tracking-[0.12em] uppercase"
            />
            <Button
              type="submit"
              size="sm"
              className="rounded-3xl shadow-none"
              disabled={redeemMutation.isPending}
            >
              {redeemMutation.isPending ? t("account.redeeming") : t("account.redeemNow")}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("account.redeemCodeHint")}
          </p>

          <div className="divide-y divide-border/40 rounded-3xl border border-border/40 px-3">
            {redeemRecordsQuery.isLoading && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {t("account.loading")}
              </div>
            )}

            {!redeemRecordsQuery.isLoading && redeemRecords.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                {redeemRecordsQuery.isError
                  ? t("account.loadError")
                  : t("account.noRedeemRecords")}
              </div>
            )}

            {redeemRecords.map((record) => (
              <div key={record.id} className="flex items-center gap-3 py-3">
                <SettingIcon icon={Ticket} bg="bg-secondary" fg="text-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {record.redeemCode.title}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {record.redeemCode.code}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-medium text-green-600 dark:text-green-400">
                    +{Math.floor(record.creditsAmount).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </form>
      </OpenLoafSettingsGroup>

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
          {allTx.map((tx) => {
            const txKindLabel = getTxKindLabel(tx.kind)

            return (
              <div key={tx.id} className="flex items-center gap-3 py-2.5">
                <SettingIcon icon={Receipt} bg="bg-secondary" fg="text-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">
                      {txTypeLabels[tx.type] ?? tx.type}
                      {txKindLabel ? ` · ${txKindLabel}` : ""}
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
            )
          })}
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
