import { cn } from "@udecode/cn";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

export type NodeFrameProps = HTMLAttributes<HTMLDivElement>;

/**
 * Root container that locks node visuals to data size.
 */
export const NodeFrame = forwardRef<HTMLDivElement, NodeFrameProps>(
  ({ className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("relative h-full w-full min-h-0 min-w-0", className)}
        {...rest}
      />
    );
  }
);

NodeFrame.displayName = "NodeFrame";
