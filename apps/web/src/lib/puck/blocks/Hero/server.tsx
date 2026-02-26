/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/* eslint-disable @next/next/no-img-element */
import type { ComponentConfig } from "@/lib/puck/core";
import HeroComponent from "./Hero";
import type { HeroProps } from "./Hero";

export const Hero: ComponentConfig<HeroProps> = {
  render: HeroComponent,
};
