/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import Image from "next/image";

export function LoadingScreen() {
  return (
    <div className="grid h-svh place-items-center bg-background">
      <Image
        src="/head_s.png"
        alt="OpenLoaf logo"
        width={40}
        height={40}
        className="h-10 w-10 motion-safe:animate-pulse"
      />
    </div>
  );
}
