import type { ReactNode } from "react";

/** Provide shared layout chrome for the step-up flow. */
export default function StepUpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-sidebar text-foreground [--header-height:calc(--spacing(10))]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_top,_rgba(234,179,8,0.22),_transparent_65%)] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_65%)] blur-3xl" />
      </div>
      <div className="relative flex min-h-svh flex-col">
        <div className="electron-drag h-10 w-full shrink-0" />
        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-5xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
