import { buildToolset } from "@/ai/tools/toolRegistry";

export class ToolsetAssembler {
  /** Assemble toolset from tool ids. */
  assemble(toolIds: readonly string[]) {
    return buildToolset(toolIds);
  }
}
