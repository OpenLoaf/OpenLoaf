"use client";

import { useCallback } from "react";
import { openProjectShell, type ProjectShellSection } from "@/lib/project-shell";
import { isElectronEnv } from "@/utils/is-electron-env";
import { useBasicConfig } from "./use-basic-config";

type OpenProjectInput = {
  projectId: string;
  title: string;
  rootUri: string;
  icon?: string | null;
};

type OpenProjectOptions = {
  section?: ProjectShellSection;
  mode?: "preference" | "sidebar" | "window";
};

/** Open one project according to the current user preference. */
export function useProjectOpen() {
  const { basic } = useBasicConfig();
  const isElectron = isElectronEnv();

  return useCallback(
    (input: OpenProjectInput, options?: OpenProjectOptions) => {
      const section = options?.section ?? "canvas";
      const mode = options?.mode ?? "preference";
      const canOpenWindow =
        isElectron &&
        typeof window !== "undefined" &&
        Boolean(window.openloafElectron?.openProjectWindow);
      const shouldOpenWindow =
        canOpenWindow &&
        (mode === "window" || (mode === "preference" && basic.projectOpenMode === "window"));

      if (shouldOpenWindow) {
        void window.openloafElectron?.openProjectWindow?.({
          projectId: input.projectId,
          rootUri: input.rootUri,
          title: input.title,
          icon: input.icon,
        });
        return;
      }

      openProjectShell({
        projectId: input.projectId,
        rootUri: input.rootUri,
        title: input.title,
        icon: input.icon,
        section,
      });
    },
    [basic.projectOpenMode, isElectron],
  );
}
