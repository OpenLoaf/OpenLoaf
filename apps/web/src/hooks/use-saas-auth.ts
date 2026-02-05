"use client";

import { create } from "zustand";
import { toast } from "sonner";
import {
  buildSaasLoginUrl,
  exchangeLoginCode,
  fetchLoginCode,
  getCachedAccessToken,
  isAuthenticated,
  logout as logoutFromSaas,
  openExternalUrl,
  resolveAuthUser,
  resolveSaasBaseUrl,
  type SaasAuthUser,
  type SaasLoginProvider,
} from "@/lib/saas-auth";
import { resolveServerUrl } from "@/utils/server-url";

type LoginStatus = "idle" | "opening" | "polling" | "error";

type SaasAuthState = {
  /** Whether user is logged in. */
  loggedIn: boolean;
  /** Whether auth state is loading. */
  loading: boolean;
  /** Cached auth user. */
  user: SaasAuthUser | null;
  /** Login flow status. */
  loginStatus: LoginStatus;
  /** Login error message. */
  loginError: string | null;
  /** WeChat QR login url for embedded login flow. */
  wechatLoginUrl: string | null;
  /** Remember login preference. */
  remember: boolean;
  /** Update remember preference. */
  setRemember: (value: boolean) => void;
  /** Refresh auth status from storage. */
  refreshSession: () => Promise<void>;
  /** Start SaaS login flow. */
  startLogin: (provider: SaasLoginProvider) => Promise<void>;
  /** Cancel current login polling. */
  cancelLogin: () => void;
  /** Logout from SaaS. */
  logout: () => Promise<void>;
};

let loginPollTimer: number | null = null;
let loginPollStartedAt: number | null = null;

/** Stop login polling loop. */
function stopLoginPolling() {
  if (loginPollTimer != null) {
    window.clearInterval(loginPollTimer);
    loginPollTimer = null;
  }
  loginPollStartedAt = null;
}

/** Check whether host is loopback. */
function isLoopbackHost(hostname: string): boolean {
  if (!hostname) return false;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Resolve server port from URL. */
function resolveServerPort(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    return url.port || (url.protocol === "https:" ? "443" : "80");
  } catch {
    return null;
  }
}

export const useSaasAuth = create<SaasAuthState>((set, get) => ({
  loggedIn: false,
  loading: true,
  user: null,
  loginStatus: "idle",
  loginError: null,
  wechatLoginUrl: null,
  remember: true,
  setRemember: (value) => set({ remember: value }),
  refreshSession: async () => {
    const token = getCachedAccessToken();
    if (!token) {
      const ok = await isAuthenticated();
      const user = ok ? await resolveAuthUser() : null;
      set({
        loggedIn: ok,
        loading: false,
        user,
      });
      return;
    }
    const user = await resolveAuthUser();
    set({
      loggedIn: true,
      loading: false,
      user,
    });
  },
  startLogin: async (provider) => {
    if (get().loginStatus === "opening" || get().loginStatus === "polling") {
      return;
    }
    let saasBaseUrl = "";
    try {
      saasBaseUrl = resolveSaasBaseUrl();
    } catch {
      saasBaseUrl = "";
    }
    if (!saasBaseUrl) {
      set({ loginStatus: "error", loginError: "未配置 SaaS 地址" });
      return;
    }
    const serverUrl = resolveServerUrl();
    if (!serverUrl) {
      set({ loginStatus: "error", loginError: "未配置本地服务地址" });
      return;
    }
    const port = resolveServerPort(serverUrl);
    if (!port) {
      set({ loginStatus: "error", loginError: "无法解析本地服务端口" });
      return;
    }
    const hostname = (() => {
      try {
        return new URL(serverUrl).hostname;
      } catch {
        return "";
      }
    })();
    if (!isLoopbackHost(hostname)) {
      set({
        loginStatus: "error",
        loginError: "远程访问暂不支持 SaaS 登录，请在本机打开",
      });
      return;
    }

    const loginState = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const loginUrl = buildSaasLoginUrl({
      provider,
      returnTo: `tenas-login:${loginState}`,
      from: "electron",
      port,
    });

    set({
      loginStatus: "opening",
      loginError: null,
      // 逻辑：微信登录走弹窗内嵌二维码，避免打开系统浏览器。
      wechatLoginUrl: provider === "wechat" ? loginUrl : null,
    });
    if (provider !== "wechat") {
      try {
        await openExternalUrl(loginUrl);
      } catch (error) {
        set({
          loginStatus: "error",
          loginError: (error as Error)?.message ?? "无法打开登录页面",
          wechatLoginUrl: null,
        });
        return;
      }
    }

    stopLoginPolling();
    loginPollStartedAt = Date.now();
    set({ loginStatus: "polling", loginError: null });

    loginPollTimer = window.setInterval(async () => {
      const startedAt = loginPollStartedAt ?? Date.now();
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        stopLoginPolling();
        set({
          loginStatus: "error",
          loginError: "登录超时，请重试",
          wechatLoginUrl: null,
        });
        return;
      }
      const code = await fetchLoginCode(loginState);
      if (!code) return;
      stopLoginPolling();
      const remember = get().remember;
      const user = await exchangeLoginCode({ loginCode: code, remember });
      if (!user) {
        // 逻辑：返回 null 说明换码失败或未拿到 token。
        set({
          loginStatus: "error",
          loginError: "登录失败，请重试",
          wechatLoginUrl: null,
        });
        return;
      }
      await get().refreshSession();
      set({ loginStatus: "idle", loginError: null, wechatLoginUrl: null });
      toast.success("登录成功");
    }, 1000);
  },
  cancelLogin: () => {
    stopLoginPolling();
    set({ loginStatus: "idle", loginError: null, wechatLoginUrl: null });
  },
  logout: async () => {
    await logoutFromSaas();
    set({ loggedIn: false, user: null });
  },
}));
