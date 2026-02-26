/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport clsx from "clsx";

type OptionsObj = Record<string, boolean | string | number | null | undefined>;
type Options = string | OptionsObj;

type ClassNameConfig = {
  baseClass?: string;
};

/** Build a global class name string with modifiers. */
export const getGlobalClassName = (rootClass: string, options: Options) => {
  if (typeof options === "string") {
    return `${rootClass}-${options}`;
  }

  const mappedOptions: OptionsObj = {};
  Object.entries(options).forEach(([option, value]) => {
    mappedOptions[`${rootClass}--${option}`] = value;
  });

  return clsx({
    [rootClass]: true,
    ...mappedOptions,
  });
};

/** Create a class name resolver for CSS modules. */
const getClassNameFactory = (
  rootClass: string,
  styles: Record<string, string>,
  config: ClassNameConfig = { baseClass: "" }
) =>
(options: Options = {}) => {
  const baseClass = config.baseClass ?? "";

  if (typeof options === "string") {
    const style = styles[`${rootClass}-${options}`];

    return style ? `${baseClass}${style}` : "";
  }

  if (typeof options === "object") {
    const prefixedModifiers: OptionsObj = {};

    Object.entries(options).forEach(([modifier, value]) => {
      const className = styles[`${rootClass}--${modifier}`];
      if (className) {
        prefixedModifiers[className] = value;
      }
    });

    const base = styles[rootClass];

    return (
      baseClass +
      clsx({
        [base]: Boolean(base),
        ...prefixedModifiers,
      })
    );
  }

  return baseClass + (styles[rootClass] ?? "");
};

export default getClassNameFactory;
