"use client";
import { PanelLeft, PanelRight, Settings, Plus } from "lucide-react";
import { useSidebar } from "@/hooks/use-sidebar";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
  const { toggleLeft, toggleRight, leftOpen, rightOpen, leftPanelWidth } =
    useSidebar();

  return (
    <header className="bg-sidebar sticky top-0 z-50 flex w-full items-center">
      <div className="flex h-10 w-full items-center gap-2 px-2">
        <div
          className="flex items-center transition-all duration-200"
          style={{
            width: leftOpen ? `${leftPanelWidth}%` : "32px",
          }}
        >
          <Button
            className="h-8 w-8"
            variant="ghost"
            size="icon"
            onClick={toggleLeft}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <Button className="ml-auto h-8 w-8" variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ModeToggle />
          <Button
            className="h-8 w-8"
            variant="ghost"
            size="icon"
            onClick={toggleRight}
          >
            {rightOpen ? <PanelRight size={16} /> : <PanelRight size={16} />}
          </Button>
        </div>
      </div>
    </header>
  );
}
