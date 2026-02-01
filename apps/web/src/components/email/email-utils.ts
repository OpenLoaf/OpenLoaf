import { Archive, Inbox, Mail, Send } from "lucide-react";

import type { EmailMailboxView, MailboxNode } from "./email-types";

/** Normalize email address for matching. */
export function normalizeEmail(emailAddress: string): string {
  return emailAddress.trim().toLowerCase();
}

/** Extract email address from display text. */
export function extractEmailAddress(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0]?.trim().toLowerCase() ?? null;
}

/** Format attachment size for display. */
export function formatAttachmentSize(size?: number): string | null {
  if (!Number.isFinite(size) || !size || size <= 0) return null;
  // 逻辑：按 1024 进制缩放单位。
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const formatted = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${formatted}${units[idx]}`;
}

/** Format ISO time string for display. */
export function formatDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Format message time for list display. */
export function formatMessageTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const options: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
  };
  if (!sameYear) {
    options.year = "numeric";
  }
  return new Intl.DateTimeFormat("zh-CN", options).format(date);
}

/** Normalize mailbox attributes for matching. */
function normalizeMailboxAttributes(attributes: string[]): string[] {
  return attributes.map((attr) => attr.trim().toUpperCase());
}

/** Check if flags contain given flag. */
export function hasEmailFlag(flags: string[], target: string): boolean {
  const normalizedTarget = target.trim().toUpperCase();
  return flags.some((flag) => {
    const normalized = flag.trim().toUpperCase();
    return normalized === normalizedTarget || normalized === `\\${normalizedTarget}`;
  });
}

/** Resolve mailbox display label. */
export function getMailboxLabel(mailbox: EmailMailboxView): string {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  if (attributes.includes("\\INBOX") || mailbox.path.toUpperCase() === "INBOX") {
    return "收件箱";
  }
  if (attributes.includes("\\DRAFTS") || path.includes("draft")) {
    return "草稿";
  }
  if (attributes.includes("\\SENT") || path.includes("sent")) {
    return "已发送";
  }
  if (
    attributes.includes("\\JUNK") ||
    attributes.includes("\\SPAM") ||
    path.includes("junk") ||
    path.includes("spam")
  ) {
    return "垃圾邮件";
  }
  if (attributes.includes("\\TRASH") || path.includes("trash") || path.includes("deleted")) {
    return "已删除";
  }
  return mailbox.name || mailbox.path;
}

export function isInboxMailboxView(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  return attributes.includes("\\INBOX") || mailbox.path.toUpperCase() === "INBOX";
}

export function isDraftsMailboxView(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  return attributes.includes("\\DRAFTS") || path.includes("draft");
}

export function isSentMailboxView(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  return attributes.includes("\\SENT") || path.includes("sent");
}

/** Build forward subject line. */
export function buildForwardSubject(subject: string): string {
  const trimmed = subject.trim();
  if (!trimmed) return "Fwd: （无主题）";
  if (/^fwd:/i.test(trimmed)) return trimmed;
  return `Fwd: ${trimmed}`;
}

/** Build forward body content. */
export function buildForwardBody(input: {
  from: string;
  to: string;
  cc: string;
  time: string;
  subject: string;
  bodyText: string;
}): string {
  const lines = [
    "",
    "",
    "---------- 转发邮件 ----------",
    `发件人: ${input.from || "—"}`,
    `日期: ${input.time || "—"}`,
    `主题: ${input.subject || "—"}`,
    `收件人: ${input.to || "—"}`,
  ];
  if (input.cc) {
    lines.push(`抄送: ${input.cc}`);
  }
  lines.push("", input.bodyText || "");
  return lines.join("\n");
}

/** Check if mailbox is selectable. */
export function isMailboxSelectable(mailbox: EmailMailboxView): boolean {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  return !attributes.includes("\\NOSELECT");
}

/** Resolve mailbox icon based on IMAP attributes. */
export function resolveMailboxIcon(mailbox: EmailMailboxView) {
  const attributes = normalizeMailboxAttributes(mailbox.attributes ?? []);
  const path = mailbox.path.toLowerCase();
  if (attributes.includes("\\INBOX") || mailbox.path.toUpperCase() === "INBOX") {
    return Inbox;
  }
  if (attributes.includes("\\SENT") || path.includes("sent")) {
    return Send;
  }
  if (attributes.includes("\\ARCHIVE") || path.includes("archive")) {
    return Archive;
  }
  return Mail;
}

/** Build mailbox tree from flat list. */
export function buildMailboxTree(mailboxes: EmailMailboxView[]): MailboxNode[] {
  const nodes = mailboxes.map((mailbox) => ({ ...mailbox, children: [] as MailboxNode[] }));
  const nodeMap = new Map(nodes.map((node) => [node.path, node]));
  const roots: MailboxNode[] = [];
  nodes.forEach((node) => {
    if (node.parentPath && nodeMap.has(node.parentPath)) {
      nodeMap.get(node.parentPath)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortNodes = (items: MailboxNode[]) => {
    items.sort((a, b) => {
      const sortA = a.sort ?? 999;
      const sortB = b.sort ?? 999;
      if (sortA !== sortB) return sortA - sortB;
      return a.path.localeCompare(b.path);
    });
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

/** Move array item by index. */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  return next;
}
