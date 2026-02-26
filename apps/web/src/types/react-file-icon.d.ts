/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\ndeclare module "react-file-icon" {
  import type { ComponentType } from "react";

  /** React component that renders a file icon. */
  export const FileIcon: ComponentType<Record<string, unknown>>;
  /** Default style map keyed by file extension. */
  export const defaultStyles: Record<string, Record<string, unknown>>;
}
