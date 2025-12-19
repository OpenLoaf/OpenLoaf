import { truncateText } from "./text";

/**
 * 将 CDP AXValue 转换为可读字符串。
 */
function axValueToText(v: any): string {
  const value = v?.value;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (value == null) return "";
  return String(value);
}

/**
 * 粗略判断“更可能可操作/可定位”的 a11y role。
 */
function isInterestingAxRole(role: string) {
  return (
    role === "button" ||
    role === "link" ||
    role === "textbox" ||
    role === "searchbox" ||
    role === "combobox" ||
    role === "checkbox" ||
    role === "radio" ||
    role === "switch" ||
    role === "tab" ||
    role === "menuitem" ||
    role === "option" ||
    role === "listbox" ||
    role === "slider" ||
    role === "spinbutton" ||
    role === "heading"
  );
}

/**
 * 将 Accessibility Tree 收敛为“可读文本 + uid 列表”。
 * - 默认只输出“更可能可操作/可定位”的节点，避免返回整棵树导致超长。
 */
export function buildAxSnapshotText(input: {
  nodes: any[];
  verbose: boolean;
  maxChars: number;
}) {
  const { nodes, verbose, maxChars } = input;
  const lines: string[] = [];
  let currentChars = 0;

  const pushLine = (line: string) => {
    const next = currentChars + line.length + (lines.length > 0 ? 1 : 0);
    if (next > maxChars) return false;
    lines.push(line);
    currentChars = next;
    return true;
  };

  let shown = 0;
  for (const node of nodes) {
    if (!node || node.ignored === true) continue;
    const role = axValueToText(node.role);
    const name = axValueToText(node.name);
    const value = axValueToText(node.value);
    const uid =
      typeof node.backendDOMNodeId === "number"
        ? String(node.backendDOMNodeId)
        : undefined;

    const interesting =
      verbose ||
      Boolean(uid) ||
      isInterestingAxRole(role) ||
      Boolean(name) ||
      Boolean(value);
    if (!interesting) continue;

    const parts: string[] = [];
    if (uid) parts.push(`uid=${uid}`);
    if (role) parts.push(`role=${role}`);
    if (name) parts.push(`name=${JSON.stringify(truncateText(name, 200))}`);
    if (value) parts.push(`value=${JSON.stringify(truncateText(value, 200))}`);

    if (parts.length === 0) continue;
    if (!pushLine(`- ${parts.join(" ")}`)) break;
    shown++;
    if (!verbose && shown >= 300) {
      pushLine("- …[truncated: too many nodes]");
      break;
    }
  }

  const text = lines.join("\n");
  return { text: truncateText(text, maxChars), shown };
}

