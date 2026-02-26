/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport * as React from 'react';

/**
 * Returns true once the component has mounted on the client.
 */
export function useMounted() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // 仅在客户端挂载后置为 true，用于避免 SSR/CSR 差异。
    setMounted(true);
  }, []);

  return mounted;
}
