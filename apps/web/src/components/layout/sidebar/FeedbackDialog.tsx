/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SaaSClient, SaaSHttpError } from "@openloaf-saas/sdk";
import { Button } from "@openloaf/ui/button";
import { Checkbox } from "@openloaf/ui/checkbox";
import { Input } from "@openloaf/ui/input";
import { Label } from "@openloaf/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { Textarea } from "@openloaf/ui/textarea";
import { useGlobalOverlay } from "@/lib/globalShortcuts";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { resolveSaasBaseUrl, getAccessToken } from "@/lib/saas-auth";
import { resolveServerUrl } from "@/utils/server-url";
import { isElectronEnv } from "@/utils/is-electron-env";

/** Feedback category values supported by SaaS. */
type FeedbackType = "ui" | "performance" | "bug" | "feature" | "other";

const FEEDBACK_TYPE_VALUES: FeedbackType[] = ["ui", "performance", "bug", "feature", "other"];

function toOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildDeviceInfo(): { platform?: string; userAgent?: string } | undefined {
  if (typeof navigator === "undefined") return undefined;
  const uaData = (navigator as any).userAgentData;
  const platform = uaData
    ? `${uaData.platform ?? ""}${uaData.architecture ? ` (${uaData.architecture})` : ""}`
    : navigator.platform;
  const userAgent = navigator.userAgent;
  const device: { platform?: string; userAgent?: string } = {};
  if (platform?.trim()) device.platform = platform;
  if (userAgent?.trim()) device.userAgent = userAgent;
  return Object.keys(device).length > 0 ? device : undefined;
}

/** Resolve server endpoint for exporting a chat session as zip. */
function resolveSessionZipExportUrl(sessionId: string): string {
  const encodedSessionId = encodeURIComponent(sessionId);
  const apiBase = resolveServerUrl();
  if (!apiBase) return `/chat/sessions/${encodedSessionId}/export-zip`;
  return `${apiBase}/chat/sessions/${encodedSessionId}/export-zip`;
}

/** Global feedback dialog, driven by useGlobalOverlay.feedbackOpen. */
export function FeedbackDialog() {
  const { t } = useTranslation('nav');
  const open = useGlobalOverlay((s) => s.feedbackOpen);
  const setFeedbackOpen = useGlobalOverlay((s) => s.setFeedbackOpen);
  const appViewState = useAppView();
  const chatSessionId = useAppView((s) => s.chatSessionId);
  const layoutState = useLayoutState();
  const { loggedIn: authLoggedIn } = useSaasAuth();

  const [type, setType] = React.useState<FeedbackType>("other");
  const [content, setContent] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [includeLogs, setIncludeLogs] = React.useState(true);
  const [includeChatHistory, setIncludeChatHistory] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const showLogOption = isElectronEnv();
  const hasChatSession = Boolean(chatSessionId);

  const isEmailValid = React.useMemo(() => {
    const trimmed = email.trim();
    if (!trimmed) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }, [email]);

  const buildContext = React.useCallback(async () => {
    const isElectron = isElectronEnv();
    const page = typeof window !== "undefined" ? window.location.pathname : "";
    const appVersion = isElectron
      ? await window.openloafElectron?.getAppVersion?.().catch(() => null)
      : null;

    const activeParams = (layoutState.base?.params ?? {}) as Record<string, unknown>;
    const context: Record<string, unknown> = {
      page: toOptionalText(page),
      env: isElectron ? "electron" : "web",
      device: buildDeviceInfo(),
      appVersion: toOptionalText(appVersion ?? ""),
      tabId: toOptionalText(appViewState.title),
      projectId: toOptionalText(activeParams.projectId),
      rootUri: toOptionalText(activeParams.rootUri),
    };
    return Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined && value !== null)
    );
  }, [appViewState.title, layoutState.base?.params]);

  const submitFeedback = React.useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error(t('sidebar.feedback.emptyError'));
      return;
    }
    if (!authLoggedIn && !isEmailValid) {
      toast.error(t('sidebar.feedback.emailInvalid'));
      return;
    }

    const baseUrl = resolveSaasBaseUrl();
    if (!baseUrl) {
      toast.error(t('sidebar.feedback.saasNotConfigured'));
      return;
    }

    setSubmitting(true);
    try {
      const client = new SaaSClient({
        baseUrl,
        getAccessToken: async () => (await getAccessToken()) ?? "",
      });
      const context = await buildContext();

      // 附带应用日志
      if (includeLogs && isElectronEnv()) {
        const result = await window.openloafElectron?.readStartupLog?.();
        if (result?.ok) {
          const logContent = (result as { ok: true; content: string }).content;
          const blob = new Blob([logContent], { type: "text/plain" });
          try {
            const attachment = await client.feedback.uploadAttachment(blob, "startup.log");
            context.logAttachmentUrl = attachment.url;
            context.logAttachmentKey = attachment.key;
          } catch {
            context.startupLog = logContent;
          }
        }
      }

      // 附带 AI 聊天记录
      if (includeChatHistory && chatSessionId) {
        try {
          const exportUrl = resolveSessionZipExportUrl(chatSessionId);
          const exportResponse = await fetch(exportUrl, { method: "GET" });
          if (exportResponse.ok) {
            const zipBlob = await exportResponse.blob();
            if (zipBlob.size > 0) {
              const attachment = await client.feedback.uploadAttachment(
                zipBlob,
                `chat-session-${chatSessionId}.zip`,
              );
              context.chatAttachmentUrl = attachment.url;
              context.chatAttachmentKey = attachment.key;
              context.chatAttachmentBytes = zipBlob.size;
              context.chatSessionId = chatSessionId;
            }
          }
        } catch {
          // 聊天记录导出失败时静默跳过，不阻断反馈提交。
        }
      }

      await client.feedback.submit({
        source: "openloaf",
        type,
        content: trimmed,
        context,
        email: authLoggedIn ? undefined : email.trim() || undefined,
      });
      toast.success(t('sidebar.feedback.success'));
      setContent("");
      setEmail("");
      setType("other");
      setIncludeLogs(true);
      setIncludeChatHistory(false);
      setFeedbackOpen(false);
    } catch (error) {
      if (error instanceof SaaSHttpError) {
        const payload = error.payload as { message?: unknown } | undefined;
        const message = typeof payload?.message === "string" ? payload.message : "";
        toast.error(message ? t('sidebar.feedback.failedWithMessage', { message }) : t('sidebar.feedback.failed'));
        return;
      }
      toast.error(t('sidebar.feedback.failed'));
    } finally {
      setSubmitting(false);
    }
  }, [authLoggedIn, buildContext, chatSessionId, content, email, includeChatHistory, includeLogs, isEmailValid, setFeedbackOpen, type, t]);

  return (
    <Dialog open={open} onOpenChange={setFeedbackOpen}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-border/40 px-5 py-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-3xl bg-secondary">
            <MessageSquare className="h-3.5 w-3.5 text-foreground" />
          </div>
          <DialogHeader className="p-0">
            <DialogTitle className="text-sm font-medium">{t('sidebar.feedback.title')}</DialogTitle>
          </DialogHeader>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <Select value={type} onValueChange={(value) => setType(value as FeedbackType)}>
            <SelectTrigger
              aria-label={t('sidebar.feedback.typeLabel')}
              className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
            >
              <SelectValue placeholder={t('sidebar.feedback.typePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_TYPE_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`sidebar.feedback.types.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t('sidebar.feedback.contentPlaceholder')}
            className="min-h-[96px] shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
          />
          {authLoggedIn ? null : (
            <>
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('sidebar.feedback.emailPlaceholder')}
                type="email"
                className="shadow-none focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70"
              />
              {!isEmailValid ? (
                <div className="text-xs text-destructive">{t('sidebar.feedback.emailInvalid')}</div>
              ) : null}
            </>
          )}
          <div className="space-y-2">
            {showLogOption ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="feedback-dialog-include-logs"
                  checked={includeLogs}
                  onCheckedChange={(checked) => setIncludeLogs(checked === true)}
                />
                <Label
                  htmlFor="feedback-dialog-include-logs"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  {t('sidebar.feedback.includeLogs')}
                </Label>
              </div>
            ) : null}
            {hasChatSession ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="feedback-dialog-include-chat"
                  checked={includeChatHistory}
                  onCheckedChange={(checked) => setIncludeChatHistory(checked === true)}
                />
                <Label
                  htmlFor="feedback-dialog-include-chat"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  {t('sidebar.feedback.includeChatHistory')}
                </Label>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/40 bg-muted/15 px-5 py-3">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="rounded-3xl transition-colors duration-150"
            onClick={() => setFeedbackOpen(false)}
          >
            {t('sidebar.feedback.cancel')}
          </Button>
          <Button
            size="sm"
            type="button"
            className="rounded-3xl bg-secondary text-foreground shadow-none hover:bg-secondary/80 transition-colors duration-150"
            onClick={submitFeedback}
            disabled={submitting}
          >
            {submitting ? t('sidebar.feedback.submitting') : t('sidebar.feedback.submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
