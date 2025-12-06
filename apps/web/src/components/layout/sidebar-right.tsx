export default function SidebarRight() {
  return (
    <div className="bg-background h-full rounded-xl border mr-2 md-2">
      <div className="border-sidebar-border h-16 border-b flex items-center justify-center">
        <div className="text-sm font-medium">Right Sidebar</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto custom-scroll">
        <div className="p-4">
          <h3 className="text-sm font-semibold mb-2">Section 1</h3>
          <div className="space-y-2">
            <div className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
              Item 1
            </div>
            <div className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
              Item 2
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2">
        <button className="flex h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50">
          + Add new
        </button>
      </div>
    </div>
  );
}
