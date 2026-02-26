/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { ComponentConfig } from "@/lib/puck/core";
import { withLayout } from "../../components/Layout";
import TemplateComponent from "./Template";
import type { TemplateProps } from "./Template";

export const TemplateInternal: ComponentConfig<TemplateProps> = {
  render: TemplateComponent,
};

export const Template = withLayout(TemplateInternal);
