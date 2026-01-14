declare module "react-file-icon" {
  import type { ComponentType } from "react";

  /** React component that renders a file icon. */
  export const FileIcon: ComponentType<Record<string, unknown>>;
  /** Default style map keyed by file extension. */
  export const defaultStyles: Record<string, Record<string, unknown>>;
}
