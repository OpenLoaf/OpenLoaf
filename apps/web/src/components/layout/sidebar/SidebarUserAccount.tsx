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

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import {
  Sparkles,
  Lightbulb,
  LogIn,
  LogOut,
  RefreshCcw,
  Info,
  CircleUserRound,
  CreditCard,
  Globe,
} from "lucide-react"
import { toast } from "sonner"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@openloaf/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@openloaf/ui/avatar"
import { Button } from "@openloaf/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog"
import { useSaasAuth } from "@/hooks/use-saas-auth"
import { fetchUserProfile } from "@/lib/saas-auth"
import { SaasLoginDialog } from "@/components/auth/SaasLoginDialog"
import { isElectronEnv } from "@/utils/is-electron-env"
import { useGlobalOverlay } from "@/lib/globalShortcuts"
import { PricingDialog } from "@/components/billing/PricingDialog"


/** 侧边栏等级徽章样式 — 使用更轻的浅色底，避免与 sidebar 背景相同，同时不过分抢眼。 */
const SIDEBAR_MEMBERSHIP_BADGE_STYLES = {
  free: "bg-foreground/[0.05] text-foreground/65 dark:bg-foreground/[0.06] dark:text-foreground/65",
  lite: "bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400",
  pro: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400",
  premium: "bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400",
  infinity: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400",
} satisfies Record<string, string>

const SIDEBAR_MEMBERSHIP_BADGE_DEFAULT_STYLE =
  "bg-foreground/[0.05] text-foreground/65 dark:bg-foreground/[0.06] dark:text-foreground/65"

const SIDEBAR_CREDITS_TEXT_STYLE = "text-foreground"
const SIDEBAR_CREDITS_ICON_STYLE = "text-foreground"

type SidebarMembershipLevel = keyof typeof SIDEBAR_MEMBERSHIP_BADGE_STYLES

/** Build localized membership labels for sidebar account surfaces. */
function buildMembershipLabels(input: Record<SidebarMembershipLevel, string>) {
  return input
}

export function SidebarUserAccount() {
  const { t } = useTranslation('project', { keyPrefix: 'global' })
  const { t: tNav } = useTranslation('nav')
  const { t: tSettings } = useTranslation('settings')

  const [loginOpen, setLoginOpen] = React.useState(false)
  const [pricingOpen, setPricingOpen] = React.useState(false)
  const [dropdownOpen, setDropdownOpen] = React.useState(false)
  const setFeedbackOpen = useGlobalOverlay((s) => s.setFeedbackOpen)

  const {
    loggedIn: authLoggedIn,
    user: authUser,
    refreshSession,
    logout,
  } = useSaasAuth()

  const userProfileQuery = useQuery({
    queryKey: ["saas", "userProfile"],
    queryFn: fetchUserProfile,
    enabled: authLoggedIn,
    staleTime: 60_000,
  })

  React.useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  // 打开用户面板时立即刷新 SaaS 用户信息（积分、等级等）
  React.useEffect(() => {
    if (dropdownOpen && authLoggedIn) {
      void userProfileQuery.refetch()
    }
  }, [dropdownOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (authLoggedIn) {
      setLoginOpen(false)
    }
  }, [authLoggedIn])

  const membershipLabels = buildMembershipLabels({
    free: t('membership.free'),
    lite: t('membership.lite'),
    pro: t('membership.pro'),
    premium: t('membership.premium'),
    infinity: t('membership.infinity'),
  })

  const isWechatLogin = Boolean(authUser?.email?.endsWith("@wechat.local"))
  const baseAccountLabel =
    authUser?.email ?? authUser?.name ?? (authLoggedIn ? t('loggedIn') : undefined)
  const sidebarAccountLabel = isWechatLogin
    ? authUser?.name?.trim() || t('wechatUser')
    : baseAccountLabel
  const sidebarDisplayName = authUser?.name?.trim() || sidebarAccountLabel || "OpenLoaf"
  const membershipLevel = userProfileQuery.data?.membershipLevel ?? null
  const membershipLabel = membershipLevel
    ? (membershipLabels[membershipLevel] ?? membershipLevel)
    : null
  const creditsBalanceLabel = userProfileQuery.data
    ? Math.floor(userProfileQuery.data.creditsBalance).toLocaleString()
    : null
  const sidebarLoginMethodLabel = authLoggedIn
    ? (isWechatLogin ? t('wechatLogin') : t('googleLogin'))
    : t('notLoggedIn')
  const avatarAlt = sidebarAccountLabel ?? "User"
  const displayAvatar = authUser?.avatarUrl

  const handleOpenLogin = () => setLoginOpen(true)

  const handleLogout = () => {
    logout()
    toast.success(t('loggedOut'))
  }

  // ─── Electron incremental update ─────────────────────────────
  const isElectron = isElectronEnv()
  const isDevDesktop = isElectron && process.env.NODE_ENV !== "production"

  const [updateStatus, setUpdateStatus] = React.useState<OpenLoafIncrementalUpdateStatus | null>(null)
  const [restartDialogOpen, setRestartDialogOpen] = React.useState(false)
  const updateTriggeredRef = React.useRef(false)

  const UPDATE_TOAST_ID = 'sidebar-update-check'

  React.useEffect(() => {
    if (!isElectron) return
    const onUpdateStatus = (event: Event) => {
      const detail = (event as CustomEvent<OpenLoafIncrementalUpdateStatus>).detail
      if (detail) setUpdateStatus(detail)
    }
    window.addEventListener("openloaf:incremental-update:status", onUpdateStatus)
    void window.openloafElectron?.getIncrementalUpdateStatus?.().then((s) => {
      if (s) setUpdateStatus(s)
    })
    return () => window.removeEventListener("openloaf:incremental-update:status", onUpdateStatus)
  }, [isElectron])

  React.useEffect(() => {
    if (!updateStatus) return
    switch (updateStatus.state) {
      case 'checking':
        break
      case 'downloading': {
        const pct = updateStatus.progress?.percent
        const msg = pct != null
          ? `${t('downloadingUpdate')} ${Math.round(pct)}%`
          : t('downloadingUpdate')
        toast.loading(msg, { id: UPDATE_TOAST_ID })
        break
      }
      case 'ready':
        toast.dismiss(UPDATE_TOAST_ID)
        setRestartDialogOpen(true)
        break
      case 'error':
        toast.error(updateStatus.error ?? t('checkUpdateError'), { id: UPDATE_TOAST_ID })
        updateTriggeredRef.current = false
        break
      case 'idle':
        if (updateTriggeredRef.current && updateStatus.lastCheckedAt) {
          toast.success(t('isLatest'), { id: UPDATE_TOAST_ID })
          updateTriggeredRef.current = false
        }
        break
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStatus])

  const handleCheckUpdate = React.useCallback(async () => {
    if (isDevDesktop) {
      toast.message(t('devModeNoUpdate'))
      return
    }
    const api = window.openloafElectron
    if (!api?.checkIncrementalUpdate) {
      toast.message(t('envNoUpdate'))
      return
    }
    updateTriggeredRef.current = true
    toast.loading(t('checkingUpdate'), { id: UPDATE_TOAST_ID })
    await api.checkIncrementalUpdate()
  }, [isDevDesktop, t])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
        <PricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />

        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="default"
              className="h-12 rounded-3xl border-none px-1.5 py-3 ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:shadow-none [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=open]:ring-0"
            >
              <Avatar className="size-8 rounded-3xl">
                <AvatarImage src={displayAvatar || undefined} alt={avatarAlt} />
                <AvatarFallback className="bg-transparent">
                  <img
                    src="/head_s.png"
                    alt="OpenLoaf"
                    className="size-full object-contain"
                  />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex min-w-0 items-center gap-1.5 leading-5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {sidebarDisplayName}
                  </span>
                  {membershipLabel ? (
                    <span
                      className={`inline-flex shrink-0 items-center rounded-3xl px-1.5 py-px text-[10px] font-medium leading-4 transition-colors duration-150 ${SIDEBAR_MEMBERSHIP_BADGE_STYLES[membershipLevel ?? "free"] ?? SIDEBAR_MEMBERSHIP_BADGE_DEFAULT_STYLE}`}
                    >
                      {membershipLabel}
                    </span>
                  ) : null}
                </div>
                <div className="flex w-full items-center gap-1.5 overflow-hidden text-muted-foreground leading-4">
                  <span className="truncate text-[11px]">{sidebarLoginMethodLabel}</span>
                  {creditsBalanceLabel ? (
                    <span className={`ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-right text-[10px] ${SIDEBAR_CREDITS_TEXT_STYLE}`} title={t('credits')}>
                      <Sparkles className={`size-3 ${SIDEBAR_CREDITS_ICON_STYLE}`} />
                      <span>{creditsBalanceLabel}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-72 rounded-3xl p-2"
          >
            {authLoggedIn && (
              <>
                <div className="flex items-center gap-3 px-2 py-2">
                  <Avatar className="size-9">
                    <AvatarImage src={displayAvatar || undefined} alt={avatarAlt} />
                    <AvatarFallback>
                      <img
                        src="/logo.svg"
                        alt="OpenLoaf"
                        className="size-full object-cover"
                      />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 w-full items-center gap-1.5 leading-5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {authUser?.name || t('currentAccount')}
                      </span>
                      {membershipLabel ? (
                        <span
                          className={`inline-flex shrink-0 items-center rounded-3xl px-1.5 py-px text-[10px] font-medium leading-4 transition-colors duration-150 ${SIDEBAR_MEMBERSHIP_BADGE_STYLES[membershipLevel ?? "free"] ?? SIDEBAR_MEMBERSHIP_BADGE_DEFAULT_STYLE}`}
                        >
                          {membershipLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 overflow-hidden text-xs text-muted-foreground leading-4">
                      <span className="truncate">{sidebarLoginMethodLabel}</span>
                      {creditsBalanceLabel ? (
                        <span className={`ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-right text-[10px] ${SIDEBAR_CREDITS_TEXT_STYLE}`} title={t('credits')}>
                          <Sparkles className={`size-3 ${SIDEBAR_CREDITS_ICON_STYLE}`} />
                          <span>{creditsBalanceLabel}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <DropdownMenuSeparator className="my-2" />

                <div className="mx-2 mb-1 rounded-3xl bg-secondary/50 px-2.5 py-2 text-[11px] leading-[1.6] text-muted-foreground">
                  <div className="flex items-start gap-1.5">
                    <Info className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                    <div>
                      <p>{t('devNotice')}</p>
                      <p className="mt-1 text-foreground">{t('devNoticeWelcome')}</p>
                    </div>
                  </div>
                </div>

                <DropdownMenuSeparator className="my-2" />
              </>
            )}

            <div className="space-y-1">
              {!authLoggedIn && (
                <DropdownMenuItem
                  onSelect={() => handleOpenLogin()}
                  className="rounded-3xl"
                >
                  <LogIn className="size-4" />
                  {t('loginAccount')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => setFeedbackOpen(true)}
                className="rounded-3xl"
              >
                <Lightbulb className="size-4" />
                {tNav('sidebar.feedback.title')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => window.open('https://openloaf.hexems.com', '_blank')}
                className="rounded-3xl"
              >
                <Globe className="size-4" />
                {t('officialWebsite')}
              </DropdownMenuItem>
              {authLoggedIn && (
                <DropdownMenuItem
                  onSelect={() => setPricingOpen(true)}
                  className="rounded-3xl"
                >
                  <CreditCard className="size-4" />
                  {tSettings('account.upgrade')}
                </DropdownMenuItem>
              )}
              {isElectron && (
                <DropdownMenuItem
                  onSelect={() => void handleCheckUpdate()}
                  disabled={
                    isDevDesktop ||
                    updateStatus?.state === "checking" ||
                    updateStatus?.state === "downloading" ||
                    updateStatus?.state === "ready"
                  }
                  className="rounded-3xl"
                >
                  <RefreshCcw className="size-4" />
                  <span className="flex-1">
                    {updateStatus?.state === "ready"
                      ? t('updateReady')
                      : updateStatus?.state === "checking" || updateStatus?.state === "downloading"
                        ? t('updating')
                        : t('checkUpdate')}
                  </span>
                  {updateStatus?.state === "ready" && (
                    <span className="ml-1 size-2 rounded-full bg-foreground" />
                  )}
                </DropdownMenuItem>
              )}
              {authLoggedIn && (
                <DropdownMenuItem
                  onSelect={() => void handleLogout()}
                  className="rounded-3xl"
                >
                  <LogOut className="size-4" />
                  {t('logout')}
                </DropdownMenuItem>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={restartDialogOpen} onOpenChange={setRestartDialogOpen}>
          <DialogContent className="sm:max-w-sm shadow-none border-border/60">
            <DialogHeader>
              <DialogTitle>{t('updateReady')}</DialogTitle>
              <DialogDescription>{t('restartToApply')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRestartDialogOpen(false)}
                className="rounded-3xl"
              >
                {t('cancelButton')}
              </Button>
              <Button
                type="button"
                className="rounded-3xl shadow-none"
                onClick={async () => {
                  setRestartDialogOpen(false)
                  await window.openloafElectron?.relaunchApp?.()
                }}
              >
                {t('relaunchNow')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function CompactUserAvatar() {
  const { t } = useTranslation('project', { keyPrefix: 'global' })
  const { t: tNav } = useTranslation('nav')
  const { t: tSettings } = useTranslation('settings')

  const [loginOpen, setLoginOpen] = React.useState(false)
  const [pricingOpen, setPricingOpen] = React.useState(false)
  const [dropdownOpen, setDropdownOpen] = React.useState(false)
  const setFeedbackOpen = useGlobalOverlay((s) => s.setFeedbackOpen)

  const {
    loggedIn: authLoggedIn,
    user: authUser,
    refreshSession,
    logout,
  } = useSaasAuth()

  const userProfileQuery = useQuery({
    queryKey: ["saas", "userProfile", "compact"],
    queryFn: fetchUserProfile,
    enabled: authLoggedIn,
    staleTime: 60_000,
  })

  React.useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  // 打开用户面板时立即刷新 SaaS 用户信息（积分、等级等）
  React.useEffect(() => {
    if (dropdownOpen && authLoggedIn) {
      void userProfileQuery.refetch()
    }
  }, [dropdownOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (authLoggedIn) setLoginOpen(false)
  }, [authLoggedIn])

  const membershipLabels = buildMembershipLabels({
    free: t('membership.free'),
    lite: t('membership.lite'),
    pro: t('membership.pro'),
    premium: t('membership.premium'),
    infinity: t('membership.infinity'),
  })
  const isWechatLogin = Boolean(authUser?.email?.endsWith("@wechat.local"))
  const baseAccountLabel =
    authUser?.email ?? authUser?.name ?? (authLoggedIn ? t('loggedIn') : undefined)
  const sidebarAccountLabel = isWechatLogin
    ? authUser?.name?.trim() || t('wechatUser')
    : baseAccountLabel
  const sidebarLoginMethodLabel = authLoggedIn
    ? (isWechatLogin ? t('wechatLogin') : t('googleLogin'))
    : t('notLoggedIn')
  const membershipLevel = userProfileQuery.data?.membershipLevel ?? null
  const membershipLabel = membershipLevel
    ? (membershipLabels[membershipLevel] ?? membershipLevel)
    : null
  const creditsBalanceLabel = userProfileQuery.data
    ? Math.floor(userProfileQuery.data.creditsBalance).toLocaleString()
    : null
  const avatarAlt = sidebarAccountLabel ?? "User"
  const displayAvatar = authUser?.avatarUrl

  // Electron update
  const isElectron = isElectronEnv()
  const isDevDesktop = isElectron && process.env.NODE_ENV !== "production"

  const [updateStatus, setUpdateStatus] = React.useState<OpenLoafIncrementalUpdateStatus | null>(null)
  const [restartDialogOpen, setRestartDialogOpen] = React.useState(false)
  const updateTriggeredRef = React.useRef(false)
  const UPDATE_TOAST_ID = 'compact-update-check'

  React.useEffect(() => {
    if (!isElectron) return
    const onUpdateStatus = (event: Event) => {
      const detail = (event as CustomEvent<OpenLoafIncrementalUpdateStatus>).detail
      if (detail) setUpdateStatus(detail)
    }
    window.addEventListener("openloaf:incremental-update:status", onUpdateStatus)
    void window.openloafElectron?.getIncrementalUpdateStatus?.().then((s) => {
      if (s) setUpdateStatus(s)
    })
    return () => window.removeEventListener("openloaf:incremental-update:status", onUpdateStatus)
  }, [isElectron])

  React.useEffect(() => {
    if (!updateStatus) return
    switch (updateStatus.state) {
      case 'checking':
        break
      case 'downloading': {
        const pct = updateStatus.progress?.percent
        const msg = pct != null
          ? `${t('downloadingUpdate')} ${Math.round(pct)}%`
          : t('downloadingUpdate')
        toast.loading(msg, { id: UPDATE_TOAST_ID })
        break
      }
      case 'ready':
        toast.dismiss(UPDATE_TOAST_ID)
        setRestartDialogOpen(true)
        break
      case 'error':
        toast.error(updateStatus.error ?? t('checkUpdateError'), { id: UPDATE_TOAST_ID })
        updateTriggeredRef.current = false
        break
      case 'idle':
        if (updateTriggeredRef.current && updateStatus.lastCheckedAt) {
          toast.success(t('isLatest'), { id: UPDATE_TOAST_ID })
          updateTriggeredRef.current = false
        }
        break
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateStatus])

  const handleCheckUpdate = React.useCallback(async () => {
    if (isDevDesktop) {
      toast.message(t('devModeNoUpdate'))
      return
    }
    const api = window.openloafElectron
    if (!api?.checkIncrementalUpdate) {
      toast.message(t('envNoUpdate'))
      return
    }
    updateTriggeredRef.current = true
    toast.loading(t('checkingUpdate'), { id: UPDATE_TOAST_ID })
    await api.checkIncrementalUpdate()
  }, [isDevDesktop, t])

  const handleLogout = () => {
    logout()
    toast.success(t('loggedOut'))
  }

  return (
    <>
      <SaasLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      <PricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-3xl hover:bg-sidebar-accent transition-colors"
          >
            {authLoggedIn ? (
              <Avatar className="size-7 rounded-3xl">
                <AvatarImage src={displayAvatar || undefined} alt={avatarAlt} />
                <AvatarFallback className="bg-transparent">
                  <img
                    src="/head_s.png"
                    alt="OpenLoaf"
                    className="size-full object-contain"
                  />
                </AvatarFallback>
              </Avatar>
            ) : (
              <CircleUserRound className="size-5 text-sidebar-foreground/70" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={8}
          className="w-72 rounded-3xl p-2"
        >
          {authLoggedIn && (
            <>
              <div className="flex items-center gap-3 px-2 py-2">
                <Avatar className="size-9">
                  <AvatarImage src={displayAvatar || undefined} alt={avatarAlt} />
                  <AvatarFallback>
                    <img src="/logo.svg" alt="OpenLoaf" className="size-full object-cover" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 w-full items-center gap-1.5 leading-5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {authUser?.name || t('currentAccount')}
                    </span>
                    {membershipLabel ? (
                      <span
                        className={`inline-flex shrink-0 items-center rounded-3xl px-1.5 py-px text-[10px] font-medium leading-4 transition-colors duration-150 ${SIDEBAR_MEMBERSHIP_BADGE_STYLES[membershipLevel ?? "free"] ?? SIDEBAR_MEMBERSHIP_BADGE_DEFAULT_STYLE}`}
                      >
                        {membershipLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 overflow-hidden text-xs text-muted-foreground leading-4">
                    <span className="truncate">{sidebarLoginMethodLabel}</span>
                    {creditsBalanceLabel ? (
                      <span className={`ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-right text-[10px] ${SIDEBAR_CREDITS_TEXT_STYLE}`} title={t('credits')}>
                        <Sparkles className={`size-3 ${SIDEBAR_CREDITS_ICON_STYLE}`} />
                        <span>{creditsBalanceLabel}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator className="my-2" />

              <div className="mx-2 mb-1 rounded-3xl bg-secondary/50 px-2.5 py-2 text-[11px] leading-[1.6] text-muted-foreground">
                <div className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                  <div>
                    <p>{t('devNotice')}</p>
                    <p className="mt-1 text-foreground">{t('devNoticeWelcome')}</p>
                  </div>
                </div>
              </div>

              <DropdownMenuSeparator className="my-2" />
            </>
          )}
          <div className="space-y-1">
            {!authLoggedIn && (
              <DropdownMenuItem
                onSelect={() => setLoginOpen(true)}
                className="rounded-3xl"
              >
                <LogIn className="size-4" />
                {t('loginAccount')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => setFeedbackOpen(true)}
              className="rounded-3xl"
            >
              <Lightbulb className="size-4" />
              {tNav('sidebar.feedback.title')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => window.open('https://openloaf.hexems.com', '_blank')}
              className="rounded-3xl"
            >
              <Globe className="size-4" />
              {t('officialWebsite')}
            </DropdownMenuItem>
            {authLoggedIn && (
              <DropdownMenuItem
                onSelect={() => setPricingOpen(true)}
                className="rounded-3xl"
              >
                <CreditCard className="size-4" />
                {tSettings('account.upgrade')}
              </DropdownMenuItem>
            )}
            {isElectron && (
              <DropdownMenuItem
                onSelect={() => void handleCheckUpdate()}
                disabled={
                  isDevDesktop ||
                  updateStatus?.state === "checking" ||
                  updateStatus?.state === "downloading" ||
                  updateStatus?.state === "ready"
                }
                className="rounded-3xl"
              >
                <RefreshCcw className="size-4" />
                <span className="flex-1">
                  {updateStatus?.state === "ready"
                    ? t('updateReady')
                    : updateStatus?.state === "checking" || updateStatus?.state === "downloading"
                      ? t('updating')
                      : t('checkUpdate')}
                </span>
                {updateStatus?.state === "ready" && (
                  <span className="ml-1 size-2 rounded-full bg-foreground" />
                )}
              </DropdownMenuItem>
            )}
            {authLoggedIn && (
              <DropdownMenuItem
                onSelect={() => void handleLogout()}
                className="rounded-3xl"
              >
                <LogOut className="size-4" />
                {t('logout')}
              </DropdownMenuItem>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={restartDialogOpen} onOpenChange={setRestartDialogOpen}>
        <DialogContent className="sm:max-w-sm shadow-none border-border/60">
          <DialogHeader>
            <DialogTitle>{t('updateReady')}</DialogTitle>
            <DialogDescription>{t('restartToApply')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestartDialogOpen(false)}
              className="rounded-3xl"
            >
              {t('cancelButton')}
            </Button>
            <Button
              type="button"
              className="rounded-3xl shadow-none"
              onClick={async () => {
                setRestartDialogOpen(false)
                await window.openloafElectron?.relaunchApp?.()
              }}
            >
              {t('relaunchNow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
