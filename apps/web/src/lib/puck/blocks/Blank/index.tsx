import React from "react";
import type { ComponentConfig } from "@/lib/puck/core";
import styles from "./styles.module.css";
import { getClassNameFactory } from "@/lib/puck/core";

const getClassName = getClassNameFactory("Blank", styles);

export type BlankProps = {};

export const Blank: ComponentConfig<BlankProps> = {
  fields: {},
  defaultProps: {},
  render: () => {
    return <div className={getClassName()}></div>;
  },
};
