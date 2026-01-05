/* eslint-disable @next/next/no-img-element */
import type { ComponentConfig } from "@/lib/puck/core";
import HeroComponent from "./Hero";
import type { HeroProps } from "./Hero";

export const Hero: ComponentConfig<HeroProps> = {
  render: HeroComponent,
};
