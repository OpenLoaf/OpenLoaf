"use client";

import { useEffect, useMemo } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { resolveLayoutViewState } from "@/hooks/layout-utils";
import { useNavigation } from "@/hooks/use-navigation";
import { useAppView } from "@/hooks/use-app-view";
import { useLayoutState } from "@/hooks/use-layout-state";
import { buildProjectShellStateFromBase } from "@/lib/project-shell";

/** Keep layout-derived navigation state and project-shell metadata aligned. */
export function LayoutStateBridge() {
  const appState = useAppState();
  const title = useAppView((state) => state.title);
  const icon = useAppView((state) => state.icon);
  const projectShell = useAppView((state) => state.projectShell);
  const setProjectShell = useAppView((state) => state.setProjectShell);
  const base = useLayoutState((state) => state.base);
  const syncDerivedView = useNavigation((state) => state.syncDerivedView);

  const resolvedView = useMemo(() => resolveLayoutViewState(appState), [appState]);
  const derivedProjectShell = useMemo(
    () => buildProjectShellStateFromBase({ base, title, icon }),
    [base, title, icon],
  );

  useEffect(() => {
    if (projectShell || !derivedProjectShell) return;
    // 中文注释：补齐被旁路入口遗漏的 projectShell，避免标题/返回/画布上下文失联。
    setProjectShell(derivedProjectShell);
  }, [derivedProjectShell, projectShell, setProjectShell]);

  useEffect(() => {
    syncDerivedView({
      viewType: resolvedView.viewType,
      projectId:
        resolvedView.viewType === "project" ? resolvedView.projectId : null,
      globalChatSessionId:
        resolvedView.viewType === "global-chat" ? appState.chatSessionId : null,
    });
  }, [
    appState.chatSessionId,
    resolvedView.projectId,
    resolvedView.viewType,
    syncDerivedView,
  ]);

  return null;
}
