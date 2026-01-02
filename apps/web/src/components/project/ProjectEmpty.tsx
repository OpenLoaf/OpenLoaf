"use client";

interface ProjectEmptyProps {
  title?: string;
  hint?: string;
}

/** Project empty state. */
export default function ProjectEmpty({ title, hint }: ProjectEmptyProps) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="max-w-md rounded-2xl border border-dashed border-border/70 bg-card/60 px-6 py-8 text-center">
        <div className="text-base font-semibold text-foreground">
          {title ? `${title} · 首页` : "项目首页"}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {hint ?? "暂无内容，后续可从资源中选择要展示的入口。"}
        </div>
      </div>
    </div>
  );
}
