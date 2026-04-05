/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useRuntimeTasks } from "@/hooks/use-runtime-tasks";
import { useOptionalChatSession } from "../context/ChatSessionContext";
import TaskProgressBar from "./TaskProgressBar";

type Props = {
  className?: string;
};

/** Session-bound container that renders TaskProgressBar from the runtime tasks store. */
export default function TaskProgressBarContainer({ className }: Props) {
  const sessionContext = useOptionalChatSession();
  const sessionId = sessionContext?.sessionId;

  // Precise subscription: only re-render when THIS session's tasks map changes.
  const sessionTasks = useRuntimeTasks(
    useShallow((s) => (sessionId ? s.bySession[sessionId]?.tasks ?? null : null)),
  );

  const tasks = useMemo(() => {
    if (!sessionTasks) return [];
    return Object.values(sessionTasks).sort((a, b) => {
      const na = Number.parseInt(a.id, 10);
      const nb = Number.parseInt(b.id, 10);
      return na - nb;
    });
  }, [sessionTasks]);

  if (!sessionId || tasks.length === 0) return null;

  return <TaskProgressBar tasks={tasks} className={className} />;
}
