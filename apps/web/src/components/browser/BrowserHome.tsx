"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { Globe, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type FavoriteSite = {
  id: string;
  title: string;
  url: string;
  accent: string;
};

type RecentlyClosedSite = {
  id: string;
  title: string;
  url: string;
  closedAt: string;
};

function getInitial(title: string) {
  const t = title.trim();
  if (!t) return "";
  return t.slice(0, 1).toUpperCase();
}

function SiteIcon({
  title,
  accent,
  className,
}: {
  title: string;
  accent: string;
  className?: string;
}) {
  const initial = getInitial(title);
  return (
    <div
      className={cn(
        "relative grid place-items-center rounded-2xl ring-1 ring-border/60 shadow-sm",
        className,
      )}
      style={{ background: accent }}
      aria-hidden
    >
      {initial ? (
        <span className="text-sm font-semibold text-white/95">{initial}</span>
      ) : (
        <Globe className="h-5 w-5 text-white/95" />
      )}
    </div>
  );
}

export function BrowserHome({ onOpenUrl }: { onOpenUrl?: (url: string) => void }) {
  // 页面首次展示时做轻量动效（淡入 + 上移 + 轻微缩放），更接近 Safari 的新标签页观感。
  const listVariants = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.22,
        ease: "easeOut",
        staggerChildren: 0.03,
        delayChildren: 0.04,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.18, ease: "easeOut" },
    },
  } as const;

  const favorites = useMemo<FavoriteSite[]>(
    () => [
      {
        id: "fav-1",
        title: "Google",
        url: "https://www.google.com",
        accent: "linear-gradient(135deg, #4285F4 0%, #34A853 100%)",
      },
      {
        id: "fav-2",
        title: "YouTube",
        url: "https://www.youtube.com",
        accent: "linear-gradient(135deg, #FF0033 0%, #AA001F 100%)",
      },
      {
        id: "fav-3",
        title: "GitHub",
        url: "https://github.com",
        accent: "linear-gradient(135deg, #111827 0%, #374151 100%)",
      },
      {
        id: "fav-4",
        title: "Figma",
        url: "https://www.figma.com",
        accent: "linear-gradient(135deg, #A259FF 0%, #1ABCFE 100%)",
      },
      {
        id: "fav-5",
        title: "Notion",
        url: "https://www.notion.so",
        accent: "linear-gradient(135deg, #0F172A 0%, #334155 100%)",
      },
      {
        id: "fav-6",
        title: "Twitter",
        url: "https://x.com",
        accent: "linear-gradient(135deg, #111827 0%, #0EA5E9 100%)",
      },
      {
        id: "fav-7",
        title: "Vercel",
        url: "https://vercel.com",
        accent: "linear-gradient(135deg, #0B0F19 0%, #334155 100%)",
      },
      {
        id: "fav-8",
        title: "Stack Overflow",
        url: "https://stackoverflow.com",
        accent: "linear-gradient(135deg, #F97316 0%, #FB7185 100%)",
      },
    ],
    [],
  );

  const recentlyClosed = useMemo<RecentlyClosedSite[]>(
    () => [
      {
        id: "rc-1",
        title: "shadcn/ui",
        url: "https://ui.shadcn.com",
        closedAt: "刚刚",
      },
      {
        id: "rc-2",
        title: "Next.js Docs",
        url: "https://nextjs.org/docs",
        closedAt: "3 分钟前",
      },
      {
        id: "rc-3",
        title: "Tailwind CSS",
        url: "https://tailwindcss.com/docs",
        closedAt: "10 分钟前",
      },
      {
        id: "rc-4",
        title: "Hono",
        url: "https://hono.dev",
        closedAt: "1 小时前",
      },
    ],
    [],
  );

  return (
    <div className="absolute inset-0 overflow-auto">
      <div className="mx-auto flex w-full max-w-[920px] flex-col px-6 pb-10 pt-10">
        <div className="mb-6">
          <div className="text-xs font-medium text-muted-foreground">Favorites</div>
        </div>

        <div className="rounded-2xl bg-card/40 ">
          <motion.div
            className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
            variants={listVariants}
            initial="hidden"
            animate="show"
          >
            {favorites.map((s) => (
              <motion.button
                key={s.id}
                type="button"
                className={cn(
                  "group flex w-full flex-col items-center rounded-xl p-2 transition-colors",
                  "hover:bg-sidebar/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                )}
                onClick={() => onOpenUrl?.(s.url)}
                title={s.url}
                variants={itemVariants}
              >
                <SiteIcon title={s.title} accent={s.accent} className="h-14 w-14" />
                <div className="mt-2 line-clamp-2 text-center text-[11px] leading-4 text-muted-foreground group-hover:text-foreground">
                  {s.title}
                </div>
              </motion.button>
            ))}
          </motion.div>
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <div className="text-sm font-medium text-foreground">最近关闭</div>
            <div className="text-xs text-muted-foreground">（假数据）</div>
          </div>

          <motion.div
            className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-2"
            variants={listVariants}
            initial="hidden"
            animate="show"
          >
            {recentlyClosed.map((s) => (
              <motion.button
                key={s.id}
                type="button"
                className={cn(
                  "group flex items-center gap-3 rounded-xl border bg-card/40 px-3 py-2 text-left transition-colors",
                  "hover:bg-sidebar/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                )}
                onClick={() => onOpenUrl?.(s.url)}
                title={s.url}
                variants={itemVariants}
              >
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar/40 ring-1 ring-border/60">
                  <Globe className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-foreground">{s.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{s.url}</div>
                </div>

                <div className="shrink-0 text-xs text-muted-foreground">{s.closedAt}</div>
              </motion.button>
            ))}
          </motion.div>

          
        </div>
      </div>
    </div>
  );
}
