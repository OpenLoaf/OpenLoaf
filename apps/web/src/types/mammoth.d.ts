/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\ndeclare module "mammoth/mammoth.browser" {
  const mammoth: {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value?: string | null }>;
  };
  export default mammoth;
}
