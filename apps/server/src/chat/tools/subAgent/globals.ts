// 关键：用全局引用避免 registry <-> subAgentTool 的循环依赖
export let subAgentToolRef: any;

export function setSubAgentToolRef(tool: any) {
  subAgentToolRef = tool;
}

