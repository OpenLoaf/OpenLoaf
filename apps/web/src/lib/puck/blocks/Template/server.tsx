import type { ComponentConfig } from "@/lib/puck/core";
import { withLayout } from "../../components/Layout";
import TemplateComponent from "./Template";
import type { TemplateProps } from "./Template";

export const TemplateInternal: ComponentConfig<TemplateProps> = {
  render: TemplateComponent,
};

export const Template = withLayout(TemplateInternal);
