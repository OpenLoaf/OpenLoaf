"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Globe, LogOut, Network } from "lucide-react";
import {
  StepUpFinishStep,
  type StepUpFinishSummary,
} from "@/components/step-up/StepUpFinishStep";
import {
  StepUpLoginStep,
  type StepUpLoginProviderOption,
  type StepUpLoginRegionOption,
} from "@/components/step-up/StepUpLoginStep";
import { StepUpModelStep } from "@/components/step-up/StepUpModelStep";
import {
  StepUpProviderStep,
  type StepUpProviderSelection,
} from "@/components/step-up/StepUpProviderStep";
import { StepUpWorkspaceStep } from "@/components/step-up/StepUpWorkspaceStep";
import { StepUpBasicInput } from "@/components/step-up/StepUpBasicInput";
import { setSettingValue, useSetting } from "@/hooks/use-settings";
import { WebSettingDefs } from "@/lib/setting-defs";

const LOGIN_OPTIONS: StepUpLoginProviderOption[] = [
  { id: "google", label: "Google", description: "适合已有 Google 账号" },
  { id: "github", label: "GitHub", description: "开发者常用" },
  { id: "microsoft", label: "Microsoft", description: "企业与学校账号" },
  { id: "apple", label: "Apple", description: "使用 Apple ID" },
];

const LOGIN_REGIONS: StepUpLoginRegionOption[] = [
  { id: "asia", label: "亚洲", description: "新加坡 / 东京节点" },
  { id: "europe", label: "欧洲", description: "法兰克福 / 伦敦节点" },
  { id: "americas", label: "美洲", description: "北美 / 南美节点" },
];

const LANGUAGE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "zh-CN", label: "简体中文" },
  { id: "en-US", label: "English" },
];

type StepId = "workspace" | "model" | "provider" | "login" | "finish";

type WorkspaceChoice = "local" | "cloud";
type ModelChoice = "custom" | "cloud";

type LanguageChoice = "zh-CN" | "en-US";

/** Render the step-up wizard page. */
export default function StepUpPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [workspaceChoice, setWorkspaceChoice] = useState<WorkspaceChoice | null>("cloud");
  const [modelChoice, setModelChoice] = useState<ModelChoice | null>("cloud");
  const [providerSelection, setProviderSelection] =
    useState<StepUpProviderSelection | null>(null);
  const [loginProvider, setLoginProvider] = useState<string | null>(null);
  const [loginRegion, setLoginRegion] = useState<string | null>(null);
  const [languageChoice, setLanguageChoice] = useState<LanguageChoice>("zh-CN");
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyUsername, setProxyUsername] = useState("");
  const [proxyPassword, setProxyPassword] = useState("");
  const [proxySavedAt, setProxySavedAt] = useState<number | null>(null);
  const [proxyBaseline, setProxyBaseline] = useState<{
    enabled: boolean;
    host: string;
    port: string;
    username: string;
    password: string;
  } | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [proxySeeded, setProxySeeded] = useState(false);

  const { value: proxyEnabledSetting, loaded: proxySettingLoaded } = useSetting(
    WebSettingDefs.ProxyEnabled,
  );
  const { value: proxyHostSetting } = useSetting(WebSettingDefs.ProxyHost);
  const { value: proxyPortSetting } = useSetting(WebSettingDefs.ProxyPort);
  const { value: proxyUsernameSetting } = useSetting(WebSettingDefs.ProxyUsername);
  const { value: proxyPasswordSetting } = useSetting(WebSettingDefs.ProxyPassword);

  const needsLogin = workspaceChoice === "cloud" || modelChoice === "cloud";
  const requiresProvider = modelChoice === "custom";
  // 登录步骤需同时选择区域与登录方式，避免仅选择其一继续。
  const loginReady = Boolean(loginProvider && loginRegion);
  const providerConfigured = Boolean(providerSelection);
  const proxyReady =
    !proxyEnabled || (Boolean(proxyHost.trim()) && Boolean(proxyPort.trim()));
  const proxyChanged = proxyBaseline
    ? proxyBaseline.enabled !== proxyEnabled ||
      proxyBaseline.host !== proxyHost ||
      proxyBaseline.port !== proxyPort ||
      proxyBaseline.username !== proxyUsername ||
      proxyBaseline.password !== proxyPassword
    : false;

  const steps = useMemo<StepId[]>(() => {
    // 流程：先选工作空间 -> 选模型来源 -> 自定义模型必须配置供应商 -> 若云同步/云模型则登录 -> 最终完成。
    const nextSteps: StepId[] = ["workspace", "model"];
    if (requiresProvider) nextSteps.push("provider");
    if (needsLogin) nextSteps.push("login");
    else nextSteps.push("finish");
    return nextSteps;
  }, [requiresProvider, needsLogin]);

  useEffect(() => {
    // 流程：步骤数量变化时回收索引，避免切换选项后落到不存在的步骤。
    setStepIndex((current) => Math.min(current, steps.length - 1));
  }, [steps.length]);

  useEffect(() => {
    if (modelChoice !== "cloud") return;
    // 流程：切换为 Cloud 模型时清空供应商配置，避免误判为已配置。
    setProviderSelection(null);
  }, [modelChoice]);

  useEffect(() => {
    if (needsLogin) return;
    // 流程：不需要登录时清空登录状态与区域，避免显示上一次的模拟结果。
    setLoginProvider(null);
    setLoginRegion(null);
  }, [needsLogin]);

  useEffect(() => {
    if (!proxySettingLoaded || proxySeeded) return;
    setProxyEnabled(Boolean(proxyEnabledSetting));
    setProxyHost(typeof proxyHostSetting === "string" ? proxyHostSetting : "");
    setProxyPort(typeof proxyPortSetting === "string" ? proxyPortSetting : "");
    setProxyUsername(typeof proxyUsernameSetting === "string" ? proxyUsernameSetting : "");
    setProxyPassword(typeof proxyPasswordSetting === "string" ? proxyPasswordSetting : "");
    setProxySeeded(true);
  }, [
    proxyEnabledSetting,
    proxyHostSetting,
    proxyPasswordSetting,
    proxyPortSetting,
    proxySeeded,
    proxySettingLoaded,
    proxyUsernameSetting,
  ]);

  useEffect(() => {
    if (!proxyOpen) return;
    setProxyBaseline({
      enabled: proxyEnabled,
      host: proxyHost,
      port: proxyPort,
      username: proxyUsername,
      password: proxyPassword,
    });
  }, [proxyOpen]);

  const stepId = steps[stepIndex];

  const canProceed = useMemo(() => {
    // 按步骤校验是否允许继续，避免跳过必要配置。
    if (stepId === "workspace") return Boolean(workspaceChoice);
    if (stepId === "model") return Boolean(modelChoice);
    if (stepId === "provider") return providerConfigured;
    if (stepId === "login") return loginReady;
    return true;
  }, [stepId, workspaceChoice, modelChoice, providerConfigured, loginReady]);

  const isFinalStep = stepId === "login" || stepId === "finish";
  const primaryLabel =
    stepId === "login" ? "登录并完成" : stepId === "finish" ? "完成" : "下一步";

  /** Update UI language selection during setup. */
  const handleLanguageChange = useCallback(async (next: LanguageChoice) => {
    // 流程：先更新本地选择，再尝试写入设置；失败不阻塞流程。
    setLanguageChoice(next);
    try {
      await setSettingValue(WebSettingDefs.UiLanguage, next);
    } catch {
      // no-op
    }
  }, []);

  /** Apply proxy configuration during setup. */
  const handleApplyProxy = useCallback(async () => {
    // 流程：启用代理时必须填写地址与端口，否则不允许提交。
    if (proxyEnabled && !proxyReady) return;
    const tasks = [
      setSettingValue(WebSettingDefs.ProxyEnabled, proxyEnabled),
      setSettingValue(WebSettingDefs.ProxyHost, proxyHost.trim()),
      setSettingValue(WebSettingDefs.ProxyPort, proxyPort.trim()),
      setSettingValue(WebSettingDefs.ProxyUsername, proxyUsername.trim()),
    ];
    if (!proxyBaseline || proxyBaseline.password !== proxyPassword) {
      tasks.push(setSettingValue(WebSettingDefs.ProxyPassword, proxyPassword));
    }
    await Promise.all(tasks);
    setProxySavedAt(Date.now());
    setProxyOpen(false);
  }, [
    proxyEnabled,
    proxyHost,
    proxyPassword,
    proxyPort,
    proxyReady,
    proxyUsername,
  ]);

  /** Disable proxy immediately without save CTA. */
  const handleDisableProxy = useCallback(async () => {
    setProxyEnabled(false);
    await setSettingValue(WebSettingDefs.ProxyEnabled, false);
  }, []);

  /** Complete step-up initialization and return to the app. */
  const completeSetup = useCallback(async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    // 流程：先写入初始化完成标记，再回到主界面；失败则留在当前页防止丢失配置状态。
    try {
      await setSettingValue(WebSettingDefs.StepUpInitialized, true);
      router.replace("/");
    } catch {
      // no-op
    } finally {
      setIsFinishing(false);
    }
  }, [isFinishing, router]);

  /** Move to the next step or finish onboarding. */
  const handleNext = useCallback(async () => {
    if (!canProceed) return;
    if (isFinalStep) {
      await completeSetup();
      return;
    }
    // 流程：仅在校验通过时推进步骤，确保用户完成必填项。
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [canProceed, completeSetup, isFinalStep, steps.length]);

  /** Move back to the previous step. */
  const handleBack = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1));
  }, []);

  const progress = steps.length
    ? Math.round(((stepIndex + 1) / steps.length) * 100)
    : 0;

  const finishSummary: StepUpFinishSummary = {
    workspace:
      workspaceChoice === "cloud"
        ? "云端备份"
        : workspaceChoice === "local"
          ? "本地备份"
          : "未选择",
    model:
      modelChoice === "cloud"
        ? "TeaTime Cloud"
        : modelChoice === "custom"
          ? "自定义模型"
          : "未选择",
    provider: providerSelection?.display ?? "未选择",
  };

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-10 pb-14">
      <div
        className="fixed right-4 z-20 flex flex-wrap items-center gap-2"
        style={{ top: "calc(var(--header-height) + env(titlebar-area-height, 0px))" }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="secondary" aria-label="语言">
              <Globe className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuRadioGroup
              value={languageChoice}
              onValueChange={(next) =>
                void handleLanguageChange(next as LanguageChoice)
              }
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <DropdownMenuRadioItem key={option.id} value={option.id}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="sm"
          variant={proxyOpen ? "default" : "secondary"}
          onClick={() => setProxyOpen((prev) => !prev)}
          aria-label="代理设置"
        >
          <Network className="size-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void completeSetup()}
          aria-label="退出"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
      {stepId !== "workspace" ? (
        <div
          className="fixed left-4 z-20"
          style={{ top: "calc(var(--header-height) + env(titlebar-area-height, 0px))" }}
        >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={stepIndex === 0 || isFinishing}
            onClick={handleBack}
            aria-label="上一步"
          >
            <ArrowLeft className="size-4" />
          </Button>
        </div>
      ) : null}

      {proxyOpen ? (
        <div className="pt-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="rounded-3xl border border-border bg-background/80 p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-base font-medium">系统代理</div>
                <div className="text-sm text-muted-foreground">
                  配置系统代理以便访问外部服务（模拟）。
                </div>
              </div>
              <Switch
                checked={proxyEnabled}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    void handleDisableProxy();
                    return;
                  }
                  setProxyEnabled(true);
                }}
                aria-label="启用系统代理"
              />
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="proxy-host" className="text-xs font-medium">
                  代理地址
                </label>
                <StepUpBasicInput
                  id="proxy-host"
                  placeholder="127.0.0.1"
                  value={proxyHost}
                  disabled={!proxyEnabled}
                  onChange={(event) => setProxyHost(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="proxy-port" className="text-xs font-medium">
                  端口
                </label>
                <StepUpBasicInput
                  id="proxy-port"
                  placeholder="7890"
                  value={proxyPort}
                  disabled={!proxyEnabled}
                  onChange={(event) => setProxyPort(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="proxy-username" className="text-xs font-medium">
                  用户名（可选）
                </label>
                <StepUpBasicInput
                  id="proxy-username"
                  placeholder="username"
                  value={proxyUsername}
                  disabled={!proxyEnabled}
                  onChange={(event) => setProxyUsername(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="proxy-password" className="text-xs font-medium">
                  密码（可选）
                </label>
                <StepUpBasicInput
                  id="proxy-password"
                  type="password"
                  placeholder="••••••"
                  value={proxyPassword}
                  disabled={!proxyEnabled}
                  onChange={(event) => setProxyPassword(event.target.value)}
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3 text-xs">
              <Button type="button" size="sm" variant="ghost" onClick={() => setProxyOpen(false)}>
                取消
              </Button>
              {proxyChanged ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!proxyReady}
                  onClick={handleApplyProxy}
                >
                  保存
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="pt-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {stepId === "workspace" ? (
            <StepUpWorkspaceStep
              value={workspaceChoice}
              onSelect={setWorkspaceChoice}
            />
          ) : null}

          {stepId === "model" ? (
            <StepUpModelStep
              value={modelChoice}
              onSelect={setModelChoice}
            />
          ) : null}

          {stepId === "provider" ? (
            <StepUpProviderStep
              selectedKey={providerSelection?.key ?? null}
              onSelect={setProviderSelection}
            />
          ) : null}

          {stepId === "login" ? (
            <StepUpLoginStep
              loginProviders={LOGIN_OPTIONS}
              loginRegions={LOGIN_REGIONS}
              selectedProvider={loginProvider}
              selectedRegion={loginRegion}
              onSelectProvider={setLoginProvider}
              onSelectRegion={setLoginRegion}
            />
          ) : null}

          {stepId === "finish" ? <StepUpFinishStep summary={finishSummary} /> : null}
        </div>
      )}

      <div className="mt-[-8px] space-y-3">
        <div className="flex items-center justify-center">
          <Button
            type="button"
            disabled={!canProceed || isFinishing}
            onClick={() => void handleNext()}
          >
            {isFinishing ? "处理中..." : primaryLabel}
          </Button>
        </div>
      </div>
      <div className="pointer-events-none fixed bottom-0 left-0 right-0">
        <div className="border-t-4 border-border">
          <div
            className="border-t-4 border-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
