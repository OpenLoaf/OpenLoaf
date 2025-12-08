import { useTabs } from "@/hooks/use_tabs";

export default function PlantPage() {
  const { activeTabId, getTabById } = useTabs();
  const activeTab = activeTabId ? getTabById(activeTabId) : undefined;

  return (
    <div className="main-content h-full p-4 bg-background  rounded-lg">
      <h1 className="text-xl font-bold mb-4">
        {activeTab ? activeTab.title : "Plant Page"}
      </h1>
      <div className="h-[calc(100%-2rem)] rounded  p-4">
        {activeTab
          ? `${activeTab.title} - Plant Page Content`
          : "Plant Page placeholder"}
      </div>
    </div>
  );
}
