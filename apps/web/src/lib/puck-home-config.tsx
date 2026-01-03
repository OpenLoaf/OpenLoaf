import * as React from "react";
import type { Config } from "@measured/puck";

type HeadingProps = {
  /** Heading text. */
  text: string;
  /** Heading level. */
  level: 1 | 2 | 3;
};

type ParagraphProps = {
  /** Paragraph text. */
  text: string;
};

type SpacerProps = {
  /** Spacer height in px. */
  size: number;
};

type HomePageComponents = {
  /** Heading component props. */
  Heading: HeadingProps;
  /** Paragraph component props. */
  Paragraph: ParagraphProps;
  /** Spacer component props. */
  Spacer: SpacerProps;
};

/** Heading size map. */
const headingClasses: Record<HeadingProps["level"], string> = {
  1: "text-2xl font-semibold",
  2: "text-xl font-semibold",
  3: "text-lg font-semibold",
};

/** Homepage Puck config with minimal components. */
export const homePagePuckConfig: Config<HomePageComponents> = {
  // 主页保持最小组件集合，降低编辑成本。
  components: {
    Heading: {
      label: "标题",
      fields: {
        text: {
          type: "text",
          label: "文本",
          contentEditable: true,
        },
        level: {
          type: "select",
          label: "级别",
          options: [
            { label: "H1", value: 1 },
            { label: "H2", value: 2 },
            { label: "H3", value: 3 },
          ],
        },
      },
      defaultProps: {
        text: "Heading",
        level: 1,
      },
      render: ({ text, level }) => {
        const Tag = `h${level}` as const;
        return <Tag className={headingClasses[level]}>{text}</Tag>;
      },
    },
    Paragraph: {
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
      render: ({ text }) => {
        return <p className="leading-7 text-foreground/80 whitespace-pre-wrap">{text}</p>;
      },
    },
    Spacer: {
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
      render: ({ size }) => {
        return <div style={{ height: size }} />;
      },
    },
  },
  root: {
    render: ({ children }) => {
      // 统一首页内容的版式与间距。
      return <div className="flex flex-col gap-4 px-10 py-6 text-sm">{children}</div>;
    },
  },
};
