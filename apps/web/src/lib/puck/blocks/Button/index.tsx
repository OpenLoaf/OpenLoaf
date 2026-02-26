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
import { Button as _Button } from "@/lib/puck/core";

export type ButtonProps = {
  label: string;
  href: string;
  variant: "primary" | "secondary";
};

export const Button: ComponentConfig<ButtonProps> = {
  label: "Button",
  fields: {
    label: {
      type: "text",
      placeholder: "Lorem ipsum...",
      contentEditable: true,
    },
    href: { type: "text" },
    variant: {
      type: "radio",
      options: [
        { label: "primary", value: "primary" },
        { label: "secondary", value: "secondary" },
      ],
    },
  },
  defaultProps: {
    label: "Button",
    href: "#",
    variant: "primary",
  },
  render: ({ href, variant, label, puck }) => {
    return (
      <div>
        <_Button
          href={puck.isEditing ? "#" : href}
          variant={variant}
          size="large"
          tabIndex={puck.isEditing ? -1 : undefined}
        >
          {label}
        </_Button>
      </div>
    );
  },
};
