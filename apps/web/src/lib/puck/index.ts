/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport pageDefaultData from "../page-default.json";
import { Blank } from "./blocks/Blank";
import { Button } from "./blocks/Button";
import { Card } from "./blocks/Card";
import { Grid } from "./blocks/Grid";
import { Hero } from "./blocks/Hero";
import { Heading } from "./blocks/Heading";
import { Flex } from "./blocks/Flex";
import { Logos } from "./blocks/Logos";
import { Stats } from "./blocks/Stats";
import { Template } from "./blocks/Template";
import { Text } from "./blocks/Text";
import { Space } from "./blocks/Space";
import { RichText } from "./blocks/RichText";
import Root from "./root";
import type { UserConfig } from "./types";

/** Encode the component key for storage. */
const encodeComponentKey = (value: string) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64");
  }

  if (typeof btoa !== "undefined") {
    return btoa(value);
  }

  // 没有编码能力时保持原始 key，避免运行时崩溃。
  return value;
};

export const conf: UserConfig = {
  root: Root,
  categories: {
    layout: {
      components: ["Grid", "Flex", "Space", "Blank"],
    },
    typography: {
      components: ["Heading", "Text", "RichText"],
    },
    interactive: {
      title: "Actions",
      components: ["Button"],
    },
    other: {
      title: "Other",
      components: ["Card", "Hero", "Logos", "Stats", "Template"],
    },
  },
  components: {
    Blank,
    Button,
    Card,
    Grid,
    Hero,
    Heading,
    Flex,
    Logos,
    Stats,
    Template,
    Text,
    Space,
    RichText,
  } satisfies UserConfig["components"],
};

export const componentKey = encodeComponentKey(
  `${Object.keys(conf.components).join("-")}-${JSON.stringify(pageDefaultData)}`
);

export default conf;
