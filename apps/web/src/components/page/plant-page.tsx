import { useTabs } from "@/hooks/use_tabs";

export default function Editor() {
  const { activeTabId, getTabById } = useTabs();
  const activeTab = activeTabId ? getTabById(activeTabId) : undefined;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">
        {activeTab ? activeTab.title : "Editor"}
      </h1>
      <div className="h-[calc(100%-2rem)] rounded border p-4">
        {activeTab ? `${activeTab.title} content` : "Editor placeholder"}
      </div>
    </div>
  );
}
