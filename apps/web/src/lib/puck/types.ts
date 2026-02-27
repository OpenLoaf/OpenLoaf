/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Config, Data } from "./core";
import type { ButtonProps } from "./blocks/Button";
import type { BlankProps } from "./blocks/Blank";
import type { CardProps } from "./blocks/Card";
import type { GridProps } from "./blocks/Grid";
import type { HeroProps } from "./blocks/Hero";
import type { HeadingProps } from "./blocks/Heading";
import type { FlexProps } from "./blocks/Flex";
import type { LogosProps } from "./blocks/Logos";
import type { StatsProps } from "./blocks/Stats";
import type { TemplateProps } from "./blocks/Template";
import type { TextProps } from "./blocks/Text";
import type { SpaceProps } from "./blocks/Space";

import type { RootProps } from "./root";
import type { RichTextProps } from "./blocks/RichText";

export type { RootProps } from "./root";

export type Components = {
  Blank: BlankProps;
  Button: ButtonProps;
  Card: CardProps;
  Grid: GridProps;
  Hero: HeroProps;
  Heading: HeadingProps;
  Flex: FlexProps;
  Logos: LogosProps;
  Stats: StatsProps;
  Template: TemplateProps;
  Text: TextProps;
  Space: SpaceProps;
  RichText: RichTextProps;
};

export type UserConfig = Config<{
  components: Components;
  root: RootProps;
  categories: ["layout", "typography", "interactive", "other"];
  fields: {
    userField: {
      type: "userField";
      option: boolean;
    };
  };
}>;

export type UserData = Data<Components, RootProps>;
