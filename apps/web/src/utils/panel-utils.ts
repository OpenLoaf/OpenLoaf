import React from "react";
import PlantPage from "@/components/plant/Plant";
import { Chat } from "@/components/chat/Chat";

export const ComponentMap: Record<string, React.ComponentType<any>> = {
  "ai-chat": Chat,
  "plant-page": PlantPage,
};

export const getPanelTitle = (componentName: string) => {
  switch (componentName) {
    case "ai-chat":
      return "AI Chat";
    case "plant-page":
      return "Plant";
    default:
      return componentName;
  }
};
