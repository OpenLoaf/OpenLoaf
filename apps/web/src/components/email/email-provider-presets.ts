import type { ComponentType } from "react";

import { Alibaba, Apple, Google, Microsoft, Tencent } from "@lobehub/icons";
import { Mail, type LucideIcon } from "lucide-react";

type IconComponent = LucideIcon | ComponentType<{ size?: number | string; className?: string }>;

export type EmailProviderPreset = {
  id: string;
  name: string;
  icon: IconComponent;
  domains: string[];
  description?: string;
  authType: "password" | "oauth2";
  oauthProvider?: "microsoft" | "google";
  imap?: { host: string; port: number; tls: boolean };
  smtp?: { host: string; port: number; tls: boolean };
  helpUrl?: string;
  appPasswordUrl?: string;
  passwordLabel?: string;
};

export const EMAIL_PROVIDER_PRESETS: EmailProviderPreset[] = [
  {
    id: "gmail",
    name: "Gmail",
    icon: Google.Color,
    domains: ["gmail.com", "googlemail.com"],
    authType: "oauth2",
    oauthProvider: "google",
    imap: { host: "imap.gmail.com", port: 993, tls: true },
    smtp: { host: "smtp.gmail.com", port: 587, tls: true },
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    passwordLabel: "应用专用密码",
  },
  {
    id: "exchange",
    name: "Exchange / Microsoft 365",
    icon: Microsoft.Color,
    domains: [],
    authType: "oauth2",
    oauthProvider: "microsoft",
  },
  {
    id: "outlook",
    name: "Outlook / Hotmail",
    icon: Microsoft.Color,
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    authType: "password",
    imap: { host: "outlook.office365.com", port: 993, tls: true },
    smtp: { host: "smtp-mail.outlook.com", port: 587, tls: true },
    passwordLabel: "应用专用密码",
  },
  {
    id: "qq",
    name: "QQ 邮箱",
    icon: Tencent.Color,
    domains: ["qq.com", "foxmail.com"],
    authType: "password",
    imap: { host: "imap.qq.com", port: 993, tls: true },
    smtp: { host: "smtp.qq.com", port: 465, tls: true },
    appPasswordUrl: "https://wx.mail.qq.com/",
    passwordLabel: "授权码",
  },
  {
    id: "163",
    name: "网易 163 邮箱",
    icon: Mail,
    domains: ["163.com"],
    authType: "password",
    imap: { host: "imap.163.com", port: 993, tls: true },
    smtp: { host: "smtp.163.com", port: 465, tls: true },
    appPasswordUrl: "https://mail.163.com/",
    passwordLabel: "授权码",
  },
  {
    id: "aliyun",
    name: "阿里邮箱",
    icon: Alibaba.Color,
    domains: ["aliyun.com", "alibaba-inc.com"],
    authType: "password",
    imap: { host: "imap.aliyun.com", port: 993, tls: true },
    smtp: { host: "smtp.aliyun.com", port: 465, tls: true },
    passwordLabel: "密码",
  },
  {
    id: "icloud",
    name: "iCloud",
    icon: Apple,
    domains: ["icloud.com", "me.com", "mac.com"],
    authType: "password",
    imap: { host: "imap.mail.me.com", port: 993, tls: true },
    smtp: { host: "smtp.mail.me.com", port: 587, tls: true },
    appPasswordUrl: "https://appleid.apple.com/",
    passwordLabel: "应用专用密码",
  },
  {
    id: "yahoo",
    name: "Yahoo",
    icon: Mail,
    domains: ["yahoo.com", "yahoo.cn"],
    authType: "password",
    imap: { host: "imap.mail.yahoo.com", port: 993, tls: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, tls: true },
    appPasswordUrl: "https://login.yahoo.com/account/security",
    passwordLabel: "应用专用密码",
  },
  {
    id: "custom",
    name: "其他邮箱",
    icon: Mail,
    domains: [],
    authType: "password",
    imap: { host: "", port: 993, tls: true },
    smtp: { host: "", port: 465, tls: true },
    passwordLabel: "密码",
  },
];

/** 根据邮箱地址域名自动匹配服务商 */
export function detectProviderByEmail(email: string): EmailProviderPreset | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return EMAIL_PROVIDER_PRESETS.find((p) => p.domains.includes(domain)) ?? null;
}

/** 根据 ID 获取服务商预设 */
export function getProviderById(id: string): EmailProviderPreset | null {
  return EMAIL_PROVIDER_PRESETS.find((p) => p.id === id) ?? null;
}
