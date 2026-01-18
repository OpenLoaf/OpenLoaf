import {
  convertToModelMessages,
  validateUIMessages,
  type UIMessage,
  type ToolSet,
} from "ai";

/** Convert UI messages into model messages with custom data-part handling. */
export async function buildModelMessages(messages: UIMessage[], tools?: ToolSet) {
  const normalized = messages.map((message) => {
    const { id: _id, ...rest } = message as any;
    return rest;
  });
  validateUIMessages({ messages: normalized as any });
  return convertToModelMessages(normalized as any, {
    tools,
    convertDataPart: (part) => {
      if (part?.type !== "data-skill") return undefined;
      const payload = (part as any).data ?? {};
      const name = typeof payload.name === "string" ? payload.name : "unknown";
      const scope = typeof payload.scope === "string" ? payload.scope : "unknown";
      const path = typeof payload.path === "string" ? payload.path : "unknown";
      const content = typeof payload.content === "string" ? payload.content : "";
      const text = [
        `# Skill: ${name}`,
        `- scope: ${scope}`,
        `- path: ${path}`,
        "<skill>",
        content,
        "</skill>",
      ].join("\n");
      return { type: "text", text };
    },
  });
}
