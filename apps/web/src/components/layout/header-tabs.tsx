import { X, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabs } from "@/hooks/use_tabs";
import { Button } from "@/components/ui/button";

export default function HeaderTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab, addTab } = useTabs();

  const handleAddTab = () => {
    addTab({
      id: `page-${Date.now()}`,
      title: "New Page",
      type: "page",
    });
  };

  return (
    <Tabs
      value={activeTabId || ""}
      onValueChange={setActiveTab}
      className="flex-1"
    >
      <TabsList className="h-6 bg-sidebar  border-sidebar-border rounded-none p-0">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative inline-flex items-center group">
            <TabsTrigger
              value={tab.id}
              className="h-6 px-1.5 text-xs rounded-md text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm pr-7"
            >
              <span className="truncate max-w-[150px]">
                {tab.title || "Untitled"}
              </span>
            </TabsTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 h-6 w-6 transition-opacity opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              aria-label="Close tab"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {/* 添加plus按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
          aria-label="Add new tab"
          onClick={handleAddTab}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </TabsList>
    </Tabs>
  );
}
