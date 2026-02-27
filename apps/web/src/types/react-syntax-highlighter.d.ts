/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
declare module "react-syntax-highlighter" {
  export const Prism: any;
  const SyntaxHighlighter: any;
  export default SyntaxHighlighter;
}

declare module "react-syntax-highlighter/dist/cjs/styles/prism" {
  export const oneDark: any;
  export const oneLight: any;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const oneDark: any;
  export const oneLight: any;
}
