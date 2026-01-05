import React from "react";
import type { Slot } from "@/lib/puck/core";
import styles from "./styles.module.css";
import { getClassNameFactory } from "@/lib/puck/core";
import { Section } from "../../components/Section";
import type { PuckComponent } from "@/lib/puck/core";

const getClassName = getClassNameFactory("Template", styles);

export type TemplateProps = {
  template: string;
  children: Slot;
};

export const Template: PuckComponent<TemplateProps> = ({
  children: Children,
}) => {
  return (
    <Section>
      <Children className={getClassName()} />
    </Section>
  );
};

export default Template;
