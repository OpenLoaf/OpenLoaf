import { Button } from "@/components/ui/button";
import { useTabs } from "@/hooks/use_tabs";
import { Globe } from "lucide-react";

interface PlantTestProps {
  pageId?: string;
}

export default function PlantTest({ pageId }: PlantTestProps) {
  const { activeLeftPanel, addPanelDialog } = useTabs();

  const isElectron =
    process.env.NEXT_PUBLIC_ELECTRON === "1" ||
    (typeof navigator !== "undefined" &&
      navigator.userAgent.includes("Electron"));

  const dialogsCount = activeLeftPanel?.dialogs?.length ?? 0;

  return (
    <div className="px-2 py-2 space-y-2">
      <div className="text-xs text-muted-foreground">
        Dialogs (left): {dialogsCount}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          addPanelDialog("left", {
            component: "ai-chat",
            params: {},
          });
        }}
      >
        Dialog: AI Chat
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          addPanelDialog("left", {
            component: "plant-page",
            params: pageId ? { pageId } : {},
          });
        }}
      >
        Dialog: Plant
      </Button>
      {isElectron && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addPanelDialog("left", {
                component: "electron-browser",
                params: { url: "https://inside.hexems.com" },
              });
            }}
          >
            <Globe className="mr-2 h-4 w-4" />
            Dialog: Browser
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              addPanelDialog("left", {
                component: "electron-browser-window",
                params: { url: "https://inside.hexems.com", autoOpen: true },
              });
            }}
          >
            <Globe className="mr-2 h-4 w-4" />
            Test: BrowserWindow
          </Button>
        </>
      )}
    </div>
  );
}
