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
