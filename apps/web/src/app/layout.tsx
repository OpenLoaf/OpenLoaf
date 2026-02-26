/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Metadata } from "next";
import "../index.css";
import "@measured/puck/puck.css";
import "@vidstack/react/player/styles/base.css";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import Providers from "@/components/Providers";
import { Toaster } from "@openloaf/ui/sonner";
import ServerConnectionGate from "@/components/layout/ServerConnectionGate";
import { DisableLinks } from "@/components/DisableLinks";
import GlobalShortcuts from "@/components/GlobalShortcuts";
import StepUpGate from "@/components/layout/StepUpGate";

export const metadata: Metadata = {
  title: "openloaf",
  description: "openloaf",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <DisableLinks />
        <GlobalShortcuts />
        <Providers>
          <ServerConnectionGate>
            <StepUpGate>
              <div className="grid grid-rows-[auto_1fr] h-svh">{children}</div>
            </StepUpGate>
          </ServerConnectionGate>
        </Providers>
        <Toaster position="bottom-left" />
      </body>
    </html>
  );
}
