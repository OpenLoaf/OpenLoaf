import { normalizeUrl } from "@/components/browser/browser-utils";

export type FavoriteSite = {
  id: string;
  title: string;
  url: string;
  iconUrl?: string;
  accent: string;
  createdAt: number;
};

export type RecentlyClosedSite = {
  id: string;
  title: string;
  url: string;
  closedAt: number;
};

const FAVORITES_KEY = "openloaf:browser:favorites";
const RECENTS_KEY = "openloaf:browser:recently-closed";
const STORAGE_EVENT = "openloaf:browser-storage";
const MAX_FAVORITES = 24;
const MAX_RECENTS = 12;

const DEFAULT_FAVORITES: FavoriteSite[] = [
  {
    id: "fav-1",
    title: "Google",
    url: "https://www.google.com",
    accent: "linear-gradient(135deg, #4285F4 0%, #34A853 100%)",
    createdAt: Date.now(),
  },
  {
    id: "fav-2",
    title: "YouTube",
    url: "https://www.youtube.com",
    accent: "linear-gradient(135deg, #FF0033 0%, #AA001F 100%)",
    createdAt: Date.now(),
  },
  {
    id: "fav-3",
    title: "GitHub",
    url: "https://github.com",
    accent: "linear-gradient(135deg, #111827 0%, #374151 100%)",
    createdAt: Date.now(),
  },
  {
    id: "fav-4",
    title: "Figma",
    url: "https://www.figma.com",
    accent: "linear-gradient(135deg, #A259FF 0%, #1ABCFE 100%)",
    createdAt: Date.now(),
  },
  {
    id: "fav-5",
    title: "Notion",
    url: "https://www.notion.so",
    accent: "linear-gradient(135deg, #0F172A 0%, #334155 100%)",
    createdAt: Date.now(),
  },
  {
    id: "fav-6",
    title: "Twitter",
    url: "https://x.com",
    accent: "linear-gradient(135deg, #111827 0%, #0EA5E9 100%)",
    createdAt: Date.now(),
  },
  {
    id: "fav-7",
    title: "Vercel",
    url: "https://vercel.com",
    accent: "linear-gradient(135deg, #0B0F19 0%, #334155 100%)",
    createdAt: Date.now(),
  },
  {
    id: "fav-8",
    title: "Stack Overflow",
    url: "https://stackoverflow.com",
    accent: "linear-gradient(135deg, #F97316 0%, #FB7185 100%)",
    createdAt: Date.now(),
  },
];

const DEFAULT_RECENTS: RecentlyClosedSite[] = [
  {
    id: "rc-1",
    title: "shadcn/ui",
    url: "https://ui.shadcn.com",
    closedAt: Date.now(),
  },
  {
    id: "rc-2",
    title: "Next.js Docs",
    url: "https://nextjs.org/docs",
    closedAt: Date.now() - 3 * 60 * 1000,
  },
  {
    id: "rc-3",
    title: "Tailwind CSS",
    url: "https://tailwindcss.com/docs",
    closedAt: Date.now() - 10 * 60 * 1000,
  },
  {
    id: "rc-4",
    title: "Hono",
    url: "https://hono.dev",
    closedAt: Date.now() - 60 * 60 * 1000,
  },
];

const ACCENT_PALETTE = [
  "linear-gradient(135deg, #0EA5E9 0%, #22D3EE 100%)",
  "linear-gradient(135deg, #F97316 0%, #FB7185 100%)",
  "linear-gradient(135deg, #10B981 0%, #34D399 100%)",
  "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
  "linear-gradient(135deg, #111827 0%, #374151 100%)",
  "linear-gradient(135deg, #14B8A6 0%, #2DD4BF 100%)",
];

/**
 * Safely read JSON from localStorage.
 */
function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Safely write JSON into localStorage.
 */
function writeStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/**
 * Emit a storage update event for in-app listeners.
 */
function emitStorageUpdate(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
  } catch {
    // ignore
  }
}

/**
 * Generate a stable id for browser items.
 */
function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Hash a string into a number for palette selection.
 */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Pick a default accent based on the URL.
 */
function getAccentForUrl(url: string): string {
  const index = hashString(url) % ACCENT_PALETTE.length;
  return ACCENT_PALETTE[index] ?? ACCENT_PALETTE[0]!;
}

/**
 * Get the origin for a URL string.
 */
function getUrlOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/**
 * Build a display title from URL fallback when title is missing.
 */
function getTitleFallback(url: string): string {
  try {
    return new URL(url).hostname || "New Tab";
  } catch {
    return "New Tab";
  }
}

/**
 * Load favorite sites from local cache, with defaults as fallback.
 */
export function getFavoriteSites(): FavoriteSite[] {
  const stored = readStorage<FavoriteSite[]>(FAVORITES_KEY);
  if (stored && Array.isArray(stored)) return stored;
  // 首次进入时落盘默认收藏，后续用户操作就能覆盖。
  writeStorage(FAVORITES_KEY, DEFAULT_FAVORITES);
  return DEFAULT_FAVORITES;
}

/**
 * Persist favorite sites to local cache.
 */
export function setFavoriteSites(sites: FavoriteSite[]): void {
  // 强制裁剪，避免缓存无限增长。
  const next = Array.isArray(sites) ? sites.slice(0, MAX_FAVORITES) : [];
  writeStorage(FAVORITES_KEY, next);
  emitStorageUpdate();
}

/**
 * Add a site to favorites and return the updated list.
 */
export function addFavoriteSite(input: { url: string; title?: string; iconUrl?: string }): FavoriteSite[] {
  const normalizedUrl = normalizeUrl(input.url);
  if (!normalizedUrl) return getFavoriteSites();
  const title = input.title?.trim() || getTitleFallback(normalizedUrl);
  const iconUrl = input.iconUrl?.trim();
  const current = getFavoriteSites();
  // 同 URL 视为同一收藏，优先移除旧的再插入到头部。
  const filtered = current.filter((item) => item.url !== normalizedUrl);
  const next: FavoriteSite[] = [
    {
      id: generateId("fav"),
      title,
      url: normalizedUrl,
      iconUrl: iconUrl || undefined,
      accent: getAccentForUrl(normalizedUrl),
      createdAt: Date.now(),
    },
    ...filtered,
  ];
  setFavoriteSites(next);
  return next;
}

/**
 * Remove a site from favorites and return the updated list.
 */
export function removeFavoriteSite(url: string): FavoriteSite[] {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return getFavoriteSites();
  const current = getFavoriteSites();
  const next = current.filter((item) => item.url !== normalizedUrl);
  setFavoriteSites(next);
  return next;
}

/**
 * Remove a favorite site by id and return the updated list.
 */
export function removeFavoriteSiteById(id: string): FavoriteSite[] {
  const current = getFavoriteSites();
  const next = current.filter((item) => item.id !== id);
  setFavoriteSites(next);
  return next;
}

/**
 * Update a favorite site's title or URL and return the updated list.
 */
export function updateFavoriteSite(
  id: string,
  changes: { title?: string; url?: string; iconUrl?: string }
): FavoriteSite[] {
  const current = getFavoriteSites();
  const nextUrl = changes.url ? normalizeUrl(changes.url) : "";
  if (changes.url && !nextUrl) return current;
  const nextTitle = changes.title?.trim();
  const nextIconUrl = typeof changes.iconUrl === "string" ? changes.iconUrl.trim() : undefined;
  // 更新目标条目，并在 URL 变化时刷新标题/颜色。
  let next = current.map((item) => {
    if (item.id !== id) return item;
    const url = nextUrl || item.url;
    const title = nextTitle || (changes.url ? getTitleFallback(url) : item.title);
    return {
      ...item,
      url,
      title,
      iconUrl: typeof changes.iconUrl === "string" ? nextIconUrl || undefined : item.iconUrl,
      accent: changes.url ? getAccentForUrl(url) : item.accent,
    };
  });
  if (nextUrl) {
    // URL 修改后需要去重，避免出现多个相同地址的收藏。
    next = next.filter((item) => item.id === id || item.url !== nextUrl);
  }
  setFavoriteSites(next);
  return next;
}

/**
 * Update favorite icon by URL and return the updated list.
 */
export function setFavoriteIconByUrl(url: string, iconUrl?: string): FavoriteSite[] {
  const normalizedUrl = normalizeUrl(url);
  const nextIconUrl = iconUrl?.trim();
  if (!normalizedUrl || !nextIconUrl) return getFavoriteSites();
  const current = getFavoriteSites();
  const targetOrigin = getUrlOrigin(normalizedUrl);
  let changed = false;
  const next = current.map((item) => {
    if (item.url !== normalizedUrl) {
      const itemOrigin = getUrlOrigin(item.url);
      if (!targetOrigin || itemOrigin !== targetOrigin) return item;
    }
    if (item.iconUrl === nextIconUrl) return item;
    changed = true;
    return { ...item, iconUrl: nextIconUrl };
  });
  if (changed) setFavoriteSites(next);
  return next;
}

/**
 * Load recently closed sites from local cache, with defaults as fallback.
 */
export function getRecentlyClosedSites(): RecentlyClosedSite[] {
  const stored = readStorage<RecentlyClosedSite[]>(RECENTS_KEY);
  if (stored && Array.isArray(stored)) return stored;
  // 首次进入时写入示例数据，方便新用户有内容可见。
  writeStorage(RECENTS_KEY, DEFAULT_RECENTS);
  return DEFAULT_RECENTS;
}

/**
 * Add a recently closed site and return the updated list.
 */
export function addRecentlyClosedSite(input: { url: string; title?: string }): RecentlyClosedSite[] {
  const normalizedUrl = normalizeUrl(input.url);
  if (!normalizedUrl) return getRecentlyClosedSites();
  const title = input.title?.trim() || getTitleFallback(normalizedUrl);
  const current = getRecentlyClosedSites();
  // 先去重，再插入到头部，并裁剪到最大数量。
  const filtered = current.filter((item) => item.url !== normalizedUrl);
  const next: RecentlyClosedSite[] = [
    {
      id: generateId("rc"),
      title,
      url: normalizedUrl,
      closedAt: Date.now(),
    },
    ...filtered,
  ].slice(0, MAX_RECENTS);
  writeStorage(RECENTS_KEY, next);
  emitStorageUpdate();
  return next;
}

/**
 * Subscribe to storage updates and return an unsubscribe function.
 */
export function onBrowserStorageChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(STORAGE_EVENT, handler);
  return () => window.removeEventListener(STORAGE_EVENT, handler);
}
