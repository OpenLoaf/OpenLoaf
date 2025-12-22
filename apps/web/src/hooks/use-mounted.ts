import * as React from 'react';

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
