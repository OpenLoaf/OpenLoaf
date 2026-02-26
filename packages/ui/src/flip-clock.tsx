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

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const Digit = ({ value }: { value: number }) => {
  return (
    <div className="relative flex h-14 w-10 items-center justify-center overflow-hidden rounded-md bg-zinc-900 text-white font-mono text-3xl font-bold dark:bg-zinc-100 dark:text-zinc-900">
      <AnimatePresence mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

interface FlipClockProps {
  /** Whether to show seconds. */
  showSeconds?: boolean;
}

/** Render a flip clock. */
export default function FlipClock({ showSeconds = true }: FlipClockProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");

  return (
    <div className="flex justify-center items-center gap-1 min-h-[100vh]">
      {hours.split("").map((digit, i) => (
        <Digit key={`h-${i}`} value={parseInt(digit)} />
      ))}
      <span className="text-3xl font-bold text-zinc-500 dark:text-zinc-300">:</span>
      {minutes.split("").map((digit, i) => (
        <Digit key={`m-${i}`} value={parseInt(digit)} />
      ))}
      {showSeconds ? (
        <>
          <span className="text-3xl font-bold text-zinc-500 dark:text-zinc-300">:</span>
          {seconds.split("").map((digit, i) => (
            <Digit key={`s-${i}`} value={parseInt(digit)} />
          ))}
        </>
      ) : null}
    </div>
  );
}
