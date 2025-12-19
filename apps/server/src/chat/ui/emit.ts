// activeTab 已移除：所有依赖 tabId 的工具需要改为显式传参
export function requireActiveTab(): any {
  throw new Error("activeTab is not supported.");
}
