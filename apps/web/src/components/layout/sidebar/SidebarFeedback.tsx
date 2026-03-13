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
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openloaf/ui/select";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@openloaf/ui/sidebar";
import { Textarea } from "@openloaf/ui/textarea";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { resolveSaasBaseUrl, getAccessToken } from "@/lib/saas-auth";
import { isElectronEnv } from "@/utils/is-electron-env";

/** Feedback category values supported by SaaS. */
type FeedbackType = "ui" | "performance" | "bug" | "feature" | "other";

/** Feedback category values for rendering (labels resolved at runtime via i18n). */
const FEEDBACK_TYPE_VALUES: FeedbackType[] = ["ui", "performance", "bug", "feature", "other"];

/** Normalize a string value into a trimmed optional string. */
function toOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Build device metadata for feedback context. */
function buildDeviceInfo(): { platform?: string; userAgent?: string } | undefined {
  const platform = typeof navigator !== "undefined" ? navigator.platform : "";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const device: { platform?: string; userAgent?: string } = {};

  if (platform.trim()) device.platform = platform;
  if (userAgent.trim()) device.userAgent = userAgent;

  return Object.keys(device).length > 0 ? device : undefined;
}

/** Sidebar feedback entry with popover form. */
export function SidebarFeedback() {
  const { t } = useTranslation('nav');
  const appViewState = useAppView();
  const layoutState = useLayoutState();
  // 登录状态：用于决定是否显示邮箱输入框。
  const { loggedIn: authLoggedIn } = useSaasAuth();

  // Form state fields.
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<FeedbackType>("other");
  const [content, setContent] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [includeLogs, setIncludeLogs] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // 仅在 Electron 环境下显示日志上传选项。
  const showLogOption = isElectronEnv();

  /** Resolve active view metadata for context. */
  const activeViewInfo = React.useMemo(() => {
    return { id: "main", title: appViewState.title };
  }, [appViewState.title]);

  /** Resolve active layout params for context. */
  const activeParams = React.useMemo(() => {
    return (layoutState.base?.params ?? {}) as Record<string, unknown>;
  }, [layoutState.base?.params]);

  /** Validate optional email input. */
  const isEmailValid = React.useMemo(() => {
    const trimmed = email.trim();
    if (!trimmed) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }, [email]);

  /** Build feedback context payload. */
  const buildContext = React.useCallback(async () => {
    const isElectron = isElectronEnv();
    const page = typeof window !== "undefined" ? window.location.pathname : "";
    const appVersion = isElectron
      ? await window.openloafElectron?.getAppVersion?.().catch(() => null)
      : null;

    const projectId = toOptionalText(activeParams.projectId);
    const rootUri = toOptionalText(activeParams.rootUri);
    const openUri = toOptionalText(activeParams.openUri);
    const uri = toOptionalText(activeParams.uri);

    // 中文注释：按需剔除空值，避免上下文噪音。
    const context: Record<string, unknown> = {
      page: toOptionalText(page),
      env: isElectron ? "electron" : "web",
      device: buildDeviceInfo(),
      appVersion: toOptionalText(appVersion ?? ""),
      tabId: toOptionalText(activeViewInfo.id),
      tabTitle: toOptionalText(activeViewInfo.title),
      projectId,
      rootUri,
      openUri,
      uri,
    };

    return Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined && value !== null)
    );
  }, [activeParams, activeViewInfo]);

  /** Submit feedback to SaaS. */
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

      // 勾选日志时，先上传日志文件为附件，再将 URL 放入 context。
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
            // 上传失败时回退：将日志内容内联到 context
            context.startupLog = logContent;
          }
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
      setIncludeLogs(false);
      setOpen(false);
    } catch (error) {
      // 中文注释：优先展示服务端返回的错误信息。
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
  }, [authLoggedIn, buildContext, content, email, includeLogs, isEmailValid, type]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton type="button" tooltip={t('sidebar.feedback.title')}>
              <MessageSquare />
              <span className="flex-1 truncate">{t('sidebar.feedback.title')}</span>
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-80 p-3 shadow-none">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ol-blue-bg">
                  <MessageSquare className="h-3.5 w-3.5 text-ol-blue" />
                </div>
                <span className="text-sm font-medium">{t('sidebar.feedback.title')}</span>
              </div>
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
              {showLogOption ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="feedback-include-logs"
                    checked={includeLogs}
                    onCheckedChange={(checked) => setIncludeLogs(checked === true)}
                  />
                  <Label
                    htmlFor="feedback-include-logs"
                    className="text-xs text-muted-foreground cursor-pointer select-none"
                  >
                    {t('sidebar.feedback.includeLogs')}
                  </Label>
                </div>
              ) : null}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  className="rounded-full transition-colors duration-150"
                  onClick={() => setOpen(false)}
                >
                  {t('sidebar.feedback.cancel')}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  className="rounded-full bg-ol-blue-bg text-ol-blue shadow-none hover:bg-ol-blue-bg-hover transition-colors duration-150"
                  onClick={submitFeedback}
                  disabled={submitting}
                >
                  {submitting ? t('sidebar.feedback.submitting') : t('sidebar.feedback.submit')}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
