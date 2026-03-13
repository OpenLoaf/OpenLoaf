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
  Crown,
  Sparkles,
  Lightbulb,
  LogIn,
  LogOut,
  RefreshCcw,
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


/** 侧边栏等级徽章样式 — 使用更轻的浅色底，避免与 sidebar 背景相同，同时不过分抢眼。 */
const SIDEBAR_MEMBERSHIP_BADGE_STYLES = {
  free: "bg-foreground/[0.05] text-foreground/65 dark:bg-foreground/[0.06] dark:text-foreground/65",
  vip: "bg-ol-amber-bg text-ol-amber",
  svip: "bg-ol-purple-bg text-ol-purple",
  infinity: "bg-ol-blue-bg text-ol-blue",
} satisfies Record<string, string>

const SIDEBAR_MEMBERSHIP_BADGE_DEFAULT_STYLE =
  "bg-foreground/[0.05] text-foreground/65 dark:bg-foreground/[0.06] dark:text-foreground/65"

type SidebarMembershipLevel = keyof typeof SIDEBAR_MEMBERSHIP_BADGE_STYLES

/** Build localized membership labels for sidebar account surfaces. */
function buildMembershipLabels(input: Record<SidebarMembershipLevel, string>) {
  return input
}

type SidebarAccountBenefitSummaryProps = {
  creditsBalanceLabel: string | null
  creditsTitle: string
  emptyText: string
  isLoading: boolean
  loadingText: string
  membershipLabel: string | null
  membershipLevel: SidebarMembershipLevel | null
  membershipTitle: string
}

/** Render account membership and credits summary in the avatar dropdown. */
function SidebarAccountBenefitSummary({
  creditsBalanceLabel,
  creditsTitle,
  emptyText,
  isLoading,
  loadingText,
  membershipLabel,
  membershipLevel,
  membershipTitle,
}: SidebarAccountBenefitSummaryProps) {
  const membershipValueText = membershipLabel ?? (isLoading ? loadingText : emptyText)
  const creditsValueText = creditsBalanceLabel ?? (isLoading ? loadingText : emptyText)

  return (
    <div className="mx-2 rounded-xl bg-muted/30 p-1.5">
      <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ol-amber-bg text-ol-amber">
            <Crown className="size-3.5" />
          </span>
          <span className="truncate text-xs text-muted-foreground">{membershipTitle}</span>
        </div>
        {membershipLabel ? (
          <span
            className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[10px] font-medium leading-4 transition-colors duration-150 ${SIDEBAR_MEMBERSHIP_BADGE_STYLES[membershipLevel ?? "free"] ?? SIDEBAR_MEMBERSHIP_BADGE_DEFAULT_STYLE}`}
          >
            {membershipValueText}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {membershipValueText}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ol-green-bg text-ol-green">
            <Sparkles className="size-3.5" />
          </span>
          <span className="truncate text-xs text-muted-foreground">{creditsTitle}</span>
        </div>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-foreground/90">
          {creditsValueText}
        </span>
      </div>
    </div>
  )
}

export function SidebarUserAccount() {
  const { t } = useTranslation('project', { keyPrefix: 'global' })
  const { t: tNav } = useTranslation('nav')

  const [loginOpen, setLoginOpen] = React.useState(false)
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

  React.useEffect(() => {
    if (authLoggedIn) {
      setLoginOpen(false)
    }
  }, [authLoggedIn])

  const membershipLabels = buildMembershipLabels({
    free: t('membership.free'),
    vip: t('membership.vip'),
    svip: t('membership.svip'),
    infinity: t('membership.infinity'),
  })

  const isWechatLogin = Boolean(authUser?.email?.endsWith("@wechat.local"))
  const baseAccountLabel =
    authUser?.email ?? authUser?.name ?? (authLoggedIn ? t('loggedIn') : undefined)
  const sidebarAccountLabel = isWechatLogin
    ? authUser?.name?.trim() || t('wechatUser')
    : baseAccountLabel
  const sidebarDisplayName = authUser?.name?.trim() || sidebarAccountLabel || "OpenLoaf"
  const dropdownAccountLabel = isWechatLogin ? t('wechatLogin') : baseAccountLabel
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

        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="default"
              className="h-12 rounded-lg border-none px-1.5 py-3 ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:shadow-none [&:not([data-highlight])]:hover:bg-sidebar-accent [&:not([data-highlight])]:hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=open]:ring-0"
            >
              <Avatar className="size-8 rounded-md">
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
                      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[10px] font-medium leading-4 transition-colors duration-150 ${SIDEBAR_MEMBERSHIP_BADGE_STYLES[membershipLevel ?? "free"] ?? SIDEBAR_MEMBERSHIP_BADGE_DEFAULT_STYLE}`}
                    >
                      {membershipLabel}
                    </span>
                  ) : null}
                </div>
                <div className="flex w-full items-center gap-1.5 overflow-hidden text-muted-foreground leading-4">
                  <span className="truncate text-[11px]">{sidebarLoginMethodLabel}</span>
                  {creditsBalanceLabel ? (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-right text-[10px] text-muted-foreground/75" title={t('credits')}>
                      <Sparkles className="size-3 text-muted-foreground/65" />
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
            className="w-72 rounded-xl p-2"
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
                    <div className="flex items-center gap-1.5 leading-5">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {authUser?.name || t('currentAccount')}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground leading-4">{dropdownAccountLabel}</div>
                  </div>
                </div>
                <SidebarAccountBenefitSummary
                  creditsBalanceLabel={creditsBalanceLabel}
                  creditsTitle={t('settings.creditsBalance')}
                  emptyText="—"
                  isLoading={userProfileQuery.isLoading}
                  loadingText={t('settings.loading')}
                  membershipLabel={membershipLabel}
                  membershipLevel={membershipLevel}
                  membershipTitle={t('settings.membershipLevel')}
                />

                <DropdownMenuSeparator className="my-2" />
              </>
            )}

            <div className="space-y-1">
              {!authLoggedIn && (
                <DropdownMenuItem
                  onSelect={() => handleOpenLogin()}
                  className="rounded-lg bg-ol-blue-bg text-ol-blue focus:bg-ol-blue-bg-hover focus:text-ol-blue"
                >
                  <LogIn className="size-4 text-ol-blue" />
                  {t('loginAccount')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => setFeedbackOpen(true)}
                className="rounded-lg"
              >
                <Lightbulb className="size-4" />
                {tNav('sidebar.feedback.title')}
              </DropdownMenuItem>
              {isElectron && (
                <DropdownMenuItem
                  onSelect={() => void handleCheckUpdate()}
                  disabled={
                    isDevDesktop ||
                    updateStatus?.state === "checking" ||
                    updateStatus?.state === "downloading" ||
                    updateStatus?.state === "ready"
                  }
                  className="rounded-lg text-ol-amber focus:bg-ol-amber-bg focus:text-ol-amber"
                >
                  <RefreshCcw className="size-4 text-ol-amber" />
                  <span className="flex-1">
                    {updateStatus?.state === "ready"
                      ? t('updateReady')
                      : updateStatus?.state === "checking" || updateStatus?.state === "downloading"
                        ? t('updating')
                        : t('checkUpdate')}
                  </span>
                  {updateStatus?.state === "ready" && (
                    <span className="ml-1 size-2 rounded-full bg-ol-blue" />
                  )}
                </DropdownMenuItem>
              )}
              {authLoggedIn && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => void handleLogout()}
                  className="rounded-lg"
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
              >
                {t('cancelButton')}
              </Button>
              <Button
                type="button"
                className="bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover shadow-none"
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

  const [loginOpen, setLoginOpen] = React.useState(false)
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

  React.useEffect(() => {
    if (authLoggedIn) setLoginOpen(false)
  }, [authLoggedIn])

  const membershipLabels = buildMembershipLabels({
    free: t('membership.free'),
    vip: t('membership.vip'),
    svip: t('membership.svip'),
    infinity: t('membership.infinity'),
  })
  const isWechatLogin = Boolean(authUser?.email?.endsWith("@wechat.local"))
  const baseAccountLabel =
    authUser?.email ?? authUser?.name ?? (authLoggedIn ? t('loggedIn') : undefined)
  const sidebarAccountLabel = isWechatLogin
    ? authUser?.name?.trim() || t('wechatUser')
    : baseAccountLabel
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
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <Avatar className="size-7 rounded-md">
              <AvatarImage src={displayAvatar || undefined} alt={avatarAlt} />
              <AvatarFallback className="bg-transparent">
                <img
                  src="/head_s.png"
                  alt="OpenLoaf"
                  className="size-full object-contain"
                />
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="right"
          sideOffset={8}
          className="w-72 rounded-xl p-2"
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
                  <div className="flex items-center gap-1.5 leading-5">
                    <span className="min-w-0 truncate text-sm font-medium">
                      {authUser?.name || t('currentAccount')}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground leading-4">
                    {isWechatLogin ? t('wechatLogin') : baseAccountLabel}
                  </div>
                </div>
              </div>
              <SidebarAccountBenefitSummary
                creditsBalanceLabel={creditsBalanceLabel}
                creditsTitle={t('settings.creditsBalance')}
                emptyText="—"
                isLoading={userProfileQuery.isLoading}
                loadingText={t('settings.loading')}
                membershipLabel={membershipLabel}
                membershipLevel={membershipLevel}
                membershipTitle={t('settings.membershipLevel')}
              />
              <DropdownMenuSeparator className="my-2" />
            </>
          )}
          <div className="space-y-1">
            {!authLoggedIn && (
              <DropdownMenuItem
                onSelect={() => setLoginOpen(true)}
                className="rounded-lg bg-ol-blue-bg text-ol-blue focus:bg-ol-blue-bg-hover focus:text-ol-blue"
              >
                <LogIn className="size-4 text-ol-blue" />
                {t('loginAccount')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => setFeedbackOpen(true)}
              className="rounded-lg"
            >
              <Lightbulb className="size-4" />
              {tNav('sidebar.feedback.title')}
            </DropdownMenuItem>
            {isElectron && (
              <DropdownMenuItem
                onSelect={() => void handleCheckUpdate()}
                disabled={
                  isDevDesktop ||
                  updateStatus?.state === "checking" ||
                  updateStatus?.state === "downloading" ||
                  updateStatus?.state === "ready"
                }
                className="rounded-lg text-ol-amber focus:bg-ol-amber-bg focus:text-ol-amber"
              >
                <RefreshCcw className="size-4 text-ol-amber" />
                <span className="flex-1">
                  {updateStatus?.state === "ready"
                    ? t('updateReady')
                    : updateStatus?.state === "checking" || updateStatus?.state === "downloading"
                      ? t('updating')
                      : t('checkUpdate')}
                </span>
                {updateStatus?.state === "ready" && (
                  <span className="ml-1 size-2 rounded-full bg-ol-blue" />
                )}
              </DropdownMenuItem>
            )}
            {authLoggedIn && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => void handleLogout()}
                className="rounded-lg"
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
            >
              {t('cancelButton')}
            </Button>
            <Button
              type="button"
              className="bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover shadow-none"
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
