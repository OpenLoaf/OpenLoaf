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

import { useCallback, useState } from "react"
import { AlertTriangle, Download, RefreshCw, Send } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { SaaSClient } from "@openloaf-saas/sdk"
import { resolveSaasBaseUrl, getAccessToken } from "@/lib/saas-auth"
import { isElectronEnv } from "@/utils/is-electron-env"

export type CrashInfo = {
  error: string
  isUpdatedServer?: boolean
  crashedVersion?: string
  rolledBack?: boolean
}

export function ServerCrashScreen({ crashInfo }: { crashInfo: CrashInfo }) {
  const { t } = useTranslation("common")
  const [submitting, setSubmitting] = useState(false)
  const [downloadingUrl, setDownloadingUrl] = useState(false)

  const handleSubmitFeedback = useCallback(async () => {
    const baseUrl = resolveSaasBaseUrl()
    if (!baseUrl) {
      toast.error(t("crashScreen.feedbackFailed"))
      return
    }

    setSubmitting(true)
    try {
      // 读取 startup.log
      let startupLog = ""
      if (isElectronEnv()) {
        const result = await window.openloafElectron?.readStartupLog?.()
        if (result?.ok) {
          startupLog = (result as { ok: true; content: string }).content
        }
      }

      const appVersion = isElectronEnv()
        ? await window.openloafElectron?.getAppVersion?.().catch(() => null)
        : null

      const client = new SaaSClient({
        baseUrl,
        getAccessToken: async () => (await getAccessToken()) ?? "",
      })

      const feedbackApi = (
        client as unknown as {
          feedback?: {
            submit: (input: {
              source: string
              type: string
              content: string
              context?: Record<string, unknown>
            }) => Promise<unknown>
          }
        }
      ).feedback

      if (!feedbackApi?.submit) {
        toast.error(t("crashScreen.feedbackFailed"))
        return
      }

      await feedbackApi.submit({
        source: "openloaf",
        type: "bug",
        content: `[Server Crash] ${crashInfo.isUpdatedServer ? `Updated server v${crashInfo.crashedVersion ?? "unknown"} crashed` : "Server process crashed"}`,
        context: {
          crashError: crashInfo.error,
          isUpdatedServer: crashInfo.isUpdatedServer,
          crashedVersion: crashInfo.crashedVersion,
          rolledBack: crashInfo.rolledBack,
          appVersion: appVersion ?? undefined,
          platform: typeof navigator !== "undefined" ? navigator.platform : undefined,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          startupLog,
        },
      })
      toast.success(t("crashScreen.feedbackSuccess"))
    } catch {
      toast.error(t("crashScreen.feedbackFailed"))
    } finally {
      setSubmitting(false)
    }
  }, [crashInfo, t])

  const handleDownloadLatest = useCallback(async () => {
    if (!isElectronEnv()) return
    setDownloadingUrl(true)
    try {
      const result = await window.openloafElectron?.getLatestInstallerUrl?.()
      if (result?.ok && result.url) {
        await window.openloafElectron?.openExternal?.(result.url)
      } else {
        toast.error(t("crashScreen.downloadFailed"))
      }
    } catch {
      toast.error(t("crashScreen.downloadFailed"))
    } finally {
      setDownloadingUrl(false)
    }
  }, [t])

  const handleRestart = useCallback(async () => {
    if (isElectronEnv()) {
      await window.openloafElectron?.relaunchApp?.()
    }
  }, [])

  return (
    <div className="grid h-svh place-items-center bg-background">
      <div className="flex max-w-lg flex-col items-center gap-5 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        <h1 className="text-xl font-semibold text-foreground">
          {t("crashScreen.title")}
        </h1>

        <p className="text-sm text-muted-foreground">
          {crashInfo.isUpdatedServer && crashInfo.crashedVersion
            ? t("crashScreen.updateCrashedDesc", {
                version: crashInfo.crashedVersion,
              })
            : t("crashScreen.genericDesc")}
        </p>

        {crashInfo.error ? (
          <details className="w-full text-left">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {t("crashScreen.errorDetails")}
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-3xl bg-muted/50 p-3 text-xs text-muted-foreground">
              {crashInfo.error}
            </pre>
          </details>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmitFeedback}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-3xl bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted/80 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {submitting
              ? t("crashScreen.submittingFeedback")
              : t("crashScreen.submitFeedback")}
          </button>
          {isElectronEnv() ? (
            <button
              type="button"
              onClick={handleDownloadLatest}
              disabled={downloadingUrl}
              className="inline-flex items-center gap-2 rounded-3xl bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted/80 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {downloadingUrl
                ? t("crashScreen.fetchingDownload")
                : t("crashScreen.downloadLatest")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleRestart}
            className="inline-flex items-center gap-2 rounded-3xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            {t("crashScreen.restart")}
          </button>
        </div>
      </div>
    </div>
  )
}
