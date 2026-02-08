"use client";

import * as React from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { SaaSClient, SaaSHttpError } from "@tenas-saas/sdk/web";
import { Button } from "@tenas-ai/ui/button";
import { Input } from "@tenas-ai/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/select";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@tenas-ai/ui/sidebar";
import { Textarea } from "@tenas-ai/ui/textarea";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { useSaasAuth } from "@/hooks/use-saas-auth";
import { resolveSaasBaseUrl, getCachedAccessToken } from "@/lib/saas-auth";
import { isElectronEnv } from "@/utils/is-electron-env";

/** Feedback category values supported by SaaS. */
type FeedbackType = "ui" | "performance" | "bug" | "feature" | "other";

type FeedbackRequest = {
  source: string;
  type: FeedbackType;
  content: string;
  context?: Record<string, unknown>;
  email?: string;
};

/** Feedback type options for rendering. */
const FEEDBACK_TYPE_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: "ui", label: "界面体验" },
  { value: "performance", label: "性能问题" },
  { value: "bug", label: "功能异常" },
  { value: "feature", label: "功能建议" },
  { value: "other", label: "其他" },
];

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
  const { workspace: activeWorkspace } = useWorkspace();
  const activeTabId = useTabs((state) => state.activeTabId);
  const tabs = useTabs((state) => state.tabs);
  const runtimeByTabId = useTabRuntime((state) => state.runtimeByTabId);
  // 登录状态：用于决定是否显示邮箱输入框。
  const { loggedIn: authLoggedIn } = useSaasAuth();

  // Form state fields.
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<FeedbackType>("other");
  const [content, setContent] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  /** Resolve active tab metadata for context. */
  const activeTab = React.useMemo(() => {
    if (!activeTabId) return null;
    const target = tabs.find((tab) => tab.id === activeTabId) ?? null;
    if (activeWorkspace && target?.workspaceId !== activeWorkspace.id) return null;
    return target;
  }, [activeTabId, tabs, activeWorkspace]);

  /** Resolve active runtime params for context. */
  const activeParams = React.useMemo(() => {
    if (!activeTabId) return {};
    return (runtimeByTabId[activeTabId]?.base?.params ?? {}) as Record<string, unknown>;
  }, [activeTabId, runtimeByTabId]);

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
      ? await window.tenasElectron?.getAppVersion?.().catch(() => null)
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
      workspaceId: toOptionalText(activeWorkspace?.id ?? ""),
      workspaceRootUri: toOptionalText(activeWorkspace?.rootUri ?? ""),
      tabId: toOptionalText(activeTab?.id ?? ""),
      tabTitle: toOptionalText(activeTab?.title ?? ""),
      projectId,
      rootUri,
      openUri,
      uri,
    };

    return Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined && value !== null)
    );
  }, [activeParams, activeTab, activeWorkspace]);

  /** Submit feedback to SaaS. */
  const submitFeedback = React.useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("请填写反馈内容");
      return;
    }
    if (!authLoggedIn && !isEmailValid) {
      toast.error("邮箱格式不正确");
      return;
    }

    const baseUrl = resolveSaasBaseUrl();
    if (!baseUrl) {
      toast.error("SaaS 地址未配置");
      return;
    }

    setSubmitting(true);
    try {
      const client = new SaaSClient({
        baseUrl,
        getAccessToken: () => getCachedAccessToken() ?? "",
      });
      const context = await buildContext();
      const feedbackApi = (client as unknown as { feedback?: { submit: (input: FeedbackRequest) => Promise<unknown> } })
        .feedback;
      if (!feedbackApi?.submit) {
        toast.error("反馈服务暂不可用");
        return;
      }
      await feedbackApi.submit({
        source: "tenas",
        type,
        content: trimmed,
        context,
        email: authLoggedIn ? undefined : email.trim() || undefined,
      });
      toast.success("反馈已提交");
      setContent("");
      setEmail("");
      setType("other");
      setOpen(false);
    } catch (error) {
      // 中文注释：优先展示服务端返回的错误信息。
      if (error instanceof SaaSHttpError) {
        const payload = error.payload as { message?: unknown } | undefined;
        const message = typeof payload?.message === "string" ? payload.message : "";
        toast.error(message ? `反馈提交失败：${message}` : "反馈提交失败，请稍后重试");
        return;
      }
      toast.error("反馈提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }, [authLoggedIn, buildContext, content, email, isEmailValid, type]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton type="button" tooltip="反馈与建议">
              <MessageSquare />
              <span className="flex-1 truncate">反馈与建议</span>
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-80 p-3">
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium">反馈与建议</div>
              <Select value={type} onValueChange={(value) => setType(value as FeedbackType)}>
                <SelectTrigger aria-label="反馈类型">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="请描述你遇到的问题或建议"
                className="min-h-[96px]"
              />
              {authLoggedIn ? null : (
                <>
                  <Input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="可选邮箱，用于后续联系"
                    type="email"
                  />
                  {!isEmailValid ? (
                    <div className="text-xs text-destructive">邮箱格式不正确</div>
                  ) : null}
                </>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  type="button"
                  onClick={submitFeedback}
                  disabled={submitting}
                >
                  {submitting ? "提交中" : "提交"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
