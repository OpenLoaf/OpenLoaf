/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { ReactNode } from "react";
import styles from "./Heading.module.css";
import getClassNameFactory from "../core/get-class-name-factory";

const getClassName = getClassNameFactory("Heading", styles);

export type HeadingProps = {
  children: ReactNode;
  rank?: "1" | "2" | "3" | "4" | "5" | "6";
  size?: "xxxxl" | "xxxl" | "xxl" | "xl" | "l" | "m" | "s" | "xs";
};

/** Render a Puck-styled heading element. */
export const Heading = ({ children, rank, size = "m" }: HeadingProps) => {
  const Tag = rank ? (`h${rank}` as const) : "span";

  return (
    <Tag
      className={getClassName({
        [size]: true,
      })}
    >
      {children}
    </Tag>
  );
};
