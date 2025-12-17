"use client";

import { useEffect, useMemo, useState } from "react";
import { SettingsGroup } from "../SettingsGroup";
import { AgentList } from "./AgentList";
import { AgentDetailsDialog, DeleteAgentDialog } from "./AgentDialogs";
import { openUrlToolDef } from "@teatime-ai/api/types/tools/browser";
import { webFetchToolDef } from "@teatime-ai/api/types/tools/system";

export type AgentKind = "master" | "sub";

export type AgentRow = {
  id: string;
  displayName: string;
  kind: AgentKind;
  description: string;
  model: string;
  tools: string[];
  subAgents: string[];
};

export type AgentPanelState = { mode: "view" | "edit"; id: string } | null;

const SAMPLE_AGENTS: AgentRow[] = [
  {
    id: "agent_master_default",
    displayName: "默认 Agent",
    kind: "master",
    description: "对话编排器：负责委派、合并流式输出与持久化（占位）",
    model: "gpt-4o-mini",
    tools: ["system", "db", "browser"],
    subAgents: ["browser"],
  },
  {
    id: "agent_sub_browser",
    displayName: "Browser Agent",
    kind: "sub",
    description: "网页/浏览器相关任务（占位）",
    model: "gpt-4o-mini",
    tools: [webFetchToolDef.id, openUrlToolDef.id],
    subAgents: [],
  },
];

export function AgentManagement() {
  const [agents, setAgents] = useState<AgentRow[]>(SAMPLE_AGENTS);
  const [panel, setPanel] = useState<AgentPanelState>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editDraft, setEditDraft] = useState<
    Pick<AgentRow, "displayName" | "model">
  >({ displayName: "", model: "" });

  const panelAgent = useMemo(
    () => (panel ? agents.find((agent) => agent.id === panel.id) : undefined),
    [agents, panel],
  );
  const deletingAgent = useMemo(
    () => (deleteId ? agents.find((agent) => agent.id === deleteId) : undefined),
    [agents, deleteId],
  );

  useEffect(() => {
    if (panel && !panelAgent) {
      setPanel(null);
      setEditDraft({ displayName: "", model: "" });
    }
  }, [panel, panelAgent]);

  useEffect(() => {
    if (deleteId && !deletingAgent) setDeleteId(null);
  }, [deleteId, deletingAgent]);

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = agents.filter((agent) => {
      if (!normalizedQuery) return true;
      const haystack = [
        agent.displayName,
        agent.id,
        agent.description,
        agent.model,
        agent.tools.join(" "),
        agent.subAgents.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
    filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return filtered;
  }, [agents, query]);

  const openView = (id: string) => setPanel({ mode: "view", id });

  const openEdit = (id: string) => {
    const agent = agents.find((item) => item.id === id);
    if (!agent) return;
    setEditDraft({ displayName: agent.displayName, model: agent.model });
    setPanel({ mode: "edit", id });
  };

  const closePanel = () => {
    setPanel(null);
    setEditDraft({ displayName: "", model: "" });
  };

  const cancelEdit = () => {
    if (!panel) return;
    setPanel({ ...panel, mode: "view" });
    setEditDraft({ displayName: "", model: "" });
  };

  const saveEdit = () => {
    if (!panel || panel.mode !== "edit") return;
    const nextDisplayName = editDraft.displayName.trim();
    const nextModel = editDraft.model.trim();
    if (!nextDisplayName || !nextModel) return;

    setAgents((prev) =>
      prev.map((item) =>
        item.id === panel.id
          ? { ...item, displayName: nextDisplayName, model: nextModel }
          : item,
      ),
    );
    setPanel({ mode: "view", id: panel.id });
    setEditDraft({ displayName: "", model: "" });
  };

  const confirmDelete = () => {
    if (!deletingAgent) return;
    setAgents((prev) => prev.filter((agent) => agent.id !== deletingAgent.id));
    setDeleteId(null);
    if (panel?.id === deletingAgent.id) closePanel();
  };

  return (
    <>
      <SettingsGroup title="Agent 管理" showBorder={false}>
        <AgentList
          agents={filteredAgents}
          selectedId={panel?.id ?? null}
          query={query}
          onQueryChange={setQuery}
          onView={openView}
          onEdit={openEdit}
          onDelete={setDeleteId}
        />
      </SettingsGroup>

      <AgentDetailsDialog
        panel={panel}
        agent={panelAgent}
        draft={editDraft}
        onChangeDraft={setEditDraft}
        onClose={closePanel}
        onEdit={() => (panelAgent ? openEdit(panelAgent.id) : null)}
        onCancelEdit={cancelEdit}
        onSave={saveEdit}
        onDelete={() => (panelAgent ? setDeleteId(panelAgent.id) : null)}
      />

      <DeleteAgentDialog
        open={Boolean(deleteId)}
        agent={deletingAgent}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
