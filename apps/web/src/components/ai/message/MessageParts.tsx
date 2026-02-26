/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";
import * as React from "react";
import { useReducedMotion } from "motion/react";
import { renderMessageParts } from "./renderMessageParts";

type MessagePartsOptions = Parameters<typeof renderMessageParts>[1];

/** Render message parts with motion-aware animation props. */
const MessageParts = React.memo(function MessageParts({
  parts,
  options,
}: {
  parts: Parameters<typeof renderMessageParts>[0];
  options?: MessagePartsOptions;
}) {
  const reduceMotion = useReducedMotion();
  const motionProps = React.useMemo(
    () =>
      reduceMotion
        ? undefined
        : {
            initial: { opacity: 0, y: 6 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.2 },
          },
    [reduceMotion],
  );

  return (
    <>
      {renderMessageParts(parts, {
        ...options,
        motionProps,
      })}
    </>
  );
}, (prev, next) => {
  // 流式输出期间始终重渲染，确保打字机效果正常
  if (prev.options?.isAnimating || next.options?.isAnimating) return false;
  return prev.parts === next.parts;
});

export default MessageParts;
