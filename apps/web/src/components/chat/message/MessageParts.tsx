"use client";
import { useReducedMotion } from "motion/react";
import { renderMessageParts } from "./renderMessageParts";

type MessagePartsOptions = Parameters<typeof renderMessageParts>[1];

/** Render message parts with motion-aware animation props. */
export default function MessageParts({
  parts,
  options,
}: {
  parts: Parameters<typeof renderMessageParts>[0];
  options?: MessagePartsOptions;
}) {
  const reduceMotion = useReducedMotion();
  const motionProps = reduceMotion
    ? undefined
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.2 },
      };

  return (
    <>
      {renderMessageParts(parts, {
        ...options,
        motionProps,
      })}
    </>
  );
}
