'use client';

import * as React from 'react';

/**
 * Detects whether the current device supports touch input.
 */
export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);

  React.useEffect(() => {
    function onResize() {
      // 以触摸事件/触点数判断是否支持触摸输入。
      setIsTouchDevice(
        'ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          navigator.maxTouchPoints > 0
      );
    }

    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return isTouchDevice;
}
