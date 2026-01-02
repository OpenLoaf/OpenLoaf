import type { Metadata } from "next";
import "../index.css";
import "@measured/puck/puck.css";
import Providers from "@/components/Providers";
import { Toaster } from "@/components/ui/sonner";
import ServerConnectionGate from "@/components/layout/ServerConnectionGate";
import { DisableLinks } from "@/components/DisableLinks";
import GlobalShortcuts from "@/components/GlobalShortcuts";
import StepUpGate from "@/components/layout/StepUpGate";

export const metadata: Metadata = {
  title: "teatime-ai",
  description: "teatime-ai",
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
