"use client";

export default function SidebarLeft() {
  // 暂时移除trpc调用，使用静态数据避免类型错误
  const pages = {
    data: [
      { id: "1", title: "Document 1" },
      { id: "2", title: "Document 2" },
    ],
  };

  return (
    <div className="bg-sidebar text-sidebar-foreground flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto custom-scroll">
        {pages.data?.map((page) => (
          <div
            key={page.id}
            className="p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {page.title || "Untitled Page"}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 p-2 border-t border-sidebar-border">
        <div className="p-2 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          User info placeholder
        </div>
      </div>
    </div>
  );
}
