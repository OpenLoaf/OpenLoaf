/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Config } from "@measured/puck";
import conf from "@/lib/puck";
import type { ComponentConfig } from "@/lib/puck/core";
import type { Components as PuckComponents } from "@/lib/puck/types";

type ParagraphProps = {
  /** Paragraph text. */
  text: string;
};

type SpacerProps = {
  /** Spacer height in px. */
  size: number;
};

type HomePageComponents = PuckComponents & {
  /** Paragraph component props. */
  Paragraph: ParagraphProps;
  /** Spacer component props. */
  Spacer: SpacerProps;
};

const paragraphComponent: ComponentConfig<ParagraphProps> = {
  label: "段落",
  fields: {
    text: {
      type: "textarea",
      label: "内容",
    },
  },
  defaultProps: {
    text: "Write your content here.",
  },
  render: ({ text }: ParagraphProps) => {
    return (
      <p className="leading-7 text-foreground/80 whitespace-pre-wrap">{text}</p>
    );
  },
};

const spacerComponent: ComponentConfig<SpacerProps> = {
  label: "间隔",
  fields: {
    size: {
      type: "number",
      label: "高度",
      min: 8,
      max: 200,
      step: 4,
    },
  },
  defaultProps: {
    size: 24,
  },
  render: ({ size }: SpacerProps) => {
    return <div style={{ height: size }} />;
  },
};

/** Homepage Puck config with extended blocks. */
export const homePagePuckConfig: Config<HomePageComponents> = {
  ...conf,
  // 继承 demo block，并补齐现有的段落与间隔组件。
  components: {
    ...conf.components,
    Paragraph: paragraphComponent,
    Spacer: spacerComponent,
  },
  categories: {
    ...(conf.categories ?? {}),
    layout: {
      ...(conf.categories?.layout ?? { components: [] }),
      components: [...(conf.categories?.layout?.components ?? []), "Spacer"],
    },
    typography: {
      ...(conf.categories?.typography ?? { components: [] }),
      components: [...(conf.categories?.typography?.components ?? []), "Paragraph"],
    },
  },
  root: {
    render: ({ children }) => {
      // 统一首页内容的版式与间距。
      return (
        <div className="flex flex-col gap-4 px-10 py-6 text-sm">{children}</div>
      );
    },
  },
};
