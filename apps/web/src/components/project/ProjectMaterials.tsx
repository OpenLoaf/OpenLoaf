import { memo, useState } from "react";

interface ProjectMaterialsProps {
  isLoading: boolean;
  pageId?: string;
}

interface ProjectMaterialsHeaderProps {
  isLoading: boolean;
  pageTitle: string;
}

/** Project materials header. */
const ProjectMaterialsHeader = memo(function ProjectMaterialsHeader({
  isLoading,
  pageTitle,
}: ProjectMaterialsHeaderProps) {
  if (isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-base font-semibold">资料</span>
      <span className="text-xs text-muted-foreground truncate">{pageTitle}</span>
    </div>
  );
});

const QUICK_FOLDERS = [
  { name: "本周重点", hint: "12 项待处理" },
  { name: "设计交付", hint: "3 个版本" },
  { name: "会议记录", hint: "最近更新" },
];

const FOLDER_ITEMS = [
  {
    type: "folder",
    name: "需求文档",
    detail: "6 items",
    updated: "今天 10:30",
    size: "--",
  },
  {
    type: "folder",
    name: "设计稿",
    detail: "18 items",
    updated: "昨天 19:20",
    size: "--",
  },
  {
    type: "folder",
    name: "会议记录",
    detail: "7 items",
    updated: "今天 09:10",
    size: "--",
  },
  {
    type: "file",
    name: "roadmap-q4.pdf",
    detail: "2.4 MB",
    updated: "09-18 14:30",
    size: "2.4 MB",
  },
  {
    type: "file",
    name: "brand-guidelines.key",
    detail: "18.2 MB",
    updated: "09-16 11:00",
    size: "18.2 MB",
  },
  {
    type: "file",
    name: "user-research.xlsx",
    detail: "4.1 MB",
    updated: "09-13 16:40",
    size: "4.1 MB",
  },
  {
    type: "folder",
    name: "参考案例",
    detail: "11 items",
    updated: "09-12 17:20",
    size: "--",
  },
  {
    type: "file",
    name: "marketing-assets.zip",
    detail: "42.8 MB",
    updated: "09-10 09:30",
    size: "42.8 MB",
  },
];

const COLUMN_STACK = [
  {
    title: "项目文件",
    items: ["资料", "素材库", "归档", "外部共享"],
  },
  {
    title: "资料",
    items: ["需求文档", "设计稿", "会议记录", "参考案例"],
  },
  {
    title: "设计稿",
    items: ["UI", "动效", "视觉规范", "组件库"],
  },
];

type ViewMode = "icons" | "list" | "columns" | "gallery";

/** Project materials panel. */
const ProjectMaterials = memo(function ProjectMaterials({
  isLoading,
}: ProjectMaterialsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const items = FOLDER_ITEMS;

  if (isLoading) {
    return null;
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60">
        <div className="border-b border-border/60 px-4 pb-3 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>项目文件</span>
                <span>/</span>
                <span>资料</span>
              </div>
              <div className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
                {items.length} 项
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/80 p-1 text-[11px] text-muted-foreground">
                <button
                  type="button"
                  className={`rounded-full px-2 py-1 ${
                    viewMode === "icons" ? "bg-muted text-foreground" : ""
                  }`}
                  onClick={() => setViewMode("icons")}
                >
                  图标
                </button>
                <button
                  type="button"
                  className={`rounded-full px-2 py-1 ${
                    viewMode === "list" ? "bg-muted text-foreground" : ""
                  }`}
                  onClick={() => setViewMode("list")}
                >
                  列表
                </button>
                <button
                  type="button"
                  className={`rounded-full px-2 py-1 ${
                    viewMode === "columns" ? "bg-muted text-foreground" : ""
                  }`}
                  onClick={() => setViewMode("columns")}
                >
                  栏目
                </button>
                <button
                  type="button"
                  className={`rounded-full px-2 py-1 ${
                    viewMode === "gallery" ? "bg-muted text-foreground" : ""
                  }`}
                  onClick={() => setViewMode("gallery")}
                >
                  画廊
                </button>
              </div>
              <div className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] text-muted-foreground">
                排序：更新时间
              </div>
              <div className="rounded-full border border-dashed border-border/60 px-3 py-1 text-[11px] text-muted-foreground">
                新建
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-xs">
                <div className="h-2 w-2 rounded-full bg-amber-400" />
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <div className="h-2 w-2 rounded-full bg-rose-400" />
                <div className="text-muted-foreground">Finder</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                  文件
                </span>
                <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                  共享
                </span>
                <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                  历史版本
                </span>
                <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1">
                  归档
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-full border border-border/60 bg-background/80 px-3 py-2 text-[11px] text-muted-foreground">
                搜索资料、标签或成员
              </div>
              <div className="rounded-full border border-dashed border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                上传
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-border/60 px-4 py-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {QUICK_FOLDERS.map((folder) => (
              <div
                key={folder.name}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 px-3 py-3 text-xs"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">{folder.name}</div>
                  <div className="text-[11px] text-muted-foreground">{folder.hint}</div>
                </div>
                <div className="h-8 w-8 rounded-lg border border-dashed border-border/60 bg-background" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-4">
          {viewMode === "icons" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <div
                  key={`${item.type}-${item.name}`}
                  className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-background/80 p-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="rounded-full border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                      {item.type === "folder" ? "Folder" : "File"}
                    </div>
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-xl border border-dashed border-border/60 bg-background" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {viewMode === "list" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] gap-2 rounded-lg border border-dashed border-border/60 bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                <div>名称</div>
                <div>修改时间</div>
                <div>类型</div>
                <div>大小</div>
              </div>
              {items.map((item) => (
                <div
                  key={`${item.type}-${item.name}-list`}
                  className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-md border border-dashed border-border/60 bg-background" />
                    <span className="truncate text-foreground">{item.name}</span>
                  </div>
                  <div className="text-muted-foreground">{item.updated}</div>
                  <div className="text-muted-foreground">
                    {item.type === "folder" ? "Folder" : "File"}
                  </div>
                  <div className="text-muted-foreground">{item.size}</div>
                </div>
              ))}
            </div>
          ) : null}

          {viewMode === "columns" ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {COLUMN_STACK.map((column) => (
                <div
                  key={column.title}
                  className="min-h-[260px] rounded-xl border border-border/60 bg-background/80"
                >
                  <div className="border-b border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
                    {column.title}
                  </div>
                  <div className="space-y-2 p-3">
                    {column.items.map((item) => (
                      <div
                        key={`${column.title}-${item}`}
                        className="flex items-center justify-between rounded-lg border border-border/60 px-2 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-md border border-dashed border-border/60 bg-background" />
                          <span className="truncate text-foreground">{item}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">&gt;</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {viewMode === "gallery" ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="flex min-h-[280px] flex-col justify-between rounded-2xl border border-border/60 bg-gradient-to-br from-muted/70 via-background to-muted/40 p-5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>预览</span>
                  <span>更新于 09-18 14:30</span>
                </div>
                <div className="space-y-2">
                  <div className="text-lg font-semibold text-foreground">brand-guidelines.key</div>
                  <div className="text-xs text-muted-foreground">
                    版本控制已开启 · 已共享给 4 位成员
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
                    18.2 MB
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
                    Keynote
                  </span>
                  <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1">
                    Brand
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={`${item.type}-${item.name}-gallery`}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3"
                  >
                    <div className="h-10 w-10 rounded-lg border border-dashed border-border/60 bg-background" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
          已同步 8 项内容 · 共享给 6 位成员 · 存储占用 1.2 GB / 10 GB
        </div>
      </section>
    </div>
  );
});

export { ProjectMaterialsHeader };
export default ProjectMaterials;
