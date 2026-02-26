/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport React from "react";

import type { ComponentConfig } from "@/lib/puck/core";
import { Heading as _Heading } from "@/lib/puck/components/Heading";
import type { HeadingProps as _HeadingProps } from "@/lib/puck/components/Heading";
import { Section } from "../../components/Section";
import { withLayout } from "../../components/Layout";
import type { WithLayout } from "../../components/Layout";

export type HeadingProps = WithLayout<{
  align: "left" | "center" | "right";
  text?: string;
  level?: _HeadingProps["rank"] | number;
  size: _HeadingProps["size"];
}>;

const sizeOptions = [
  { value: "xxxl", label: "XXXL" },
  { value: "xxl", label: "XXL" },
  { value: "xl", label: "XL" },
  { value: "l", label: "L" },
  { value: "m", label: "M" },
  { value: "s", label: "S" },
  { value: "xs", label: "XS" },
];

const levelOptions = [
  { label: "", value: "" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
];

const HeadingInternal: ComponentConfig<HeadingProps> = {
  fields: {
    text: {
      type: "textarea",
      contentEditable: true,
    },
    size: {
      type: "select",
      options: sizeOptions,
    },
    level: {
      type: "select",
      options: levelOptions,
    },
    align: {
      type: "radio",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
  },
  defaultProps: {
    align: "left",
    text: "Heading",
    size: "m",
    layout: {
      padding: "8px",
    },
  },
  render: ({ align, text, size, level }) => {
    // 兼容旧数据的数字级别。
    const resolvedLevel =
      typeof level === "number" ? `${level}` : level || undefined;

    return (
      <Section>
        <_Heading size={size} rank={resolvedLevel as _HeadingProps["rank"]}>
          <span style={{ display: "block", textAlign: align, width: "100%" }}>
            {text}
          </span>
        </_Heading>
      </Section>
    );
  },
};

export const Heading = withLayout(HeadingInternal);
