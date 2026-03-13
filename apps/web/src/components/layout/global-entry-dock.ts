/** Workbench dock context base components. */
export const WORKBENCH_DOCK_CONTEXT_COMPONENTS = new Set([
  "global-desktop",
]);

/** Return true when one component belongs to the workbench dock context. */
export function isWorkbenchDockContextComponent(component?: string) {
  if (!component) return false;
  return WORKBENCH_DOCK_CONTEXT_COMPONENTS.has(component);
}
