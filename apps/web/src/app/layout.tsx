import type { Metadata } from "next";
import "../index.css";
import Providers from "@/components/layout/Providers";
import { Toaster } from "@/components/ui/sonner";
import ServerConnectionGate from "@/components/layout/ServerConnectionGate";
import { DisableLinks } from "@/components/layout/DisableLinks";
import GlobalShortcuts from "@/app/GlobalShortcuts";

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
            <div className="grid grid-rows-[auto_1fr] h-svh">{children}</div>
          </ServerConnectionGate>
        </Providers>
        <Toaster position="bottom-left" />
      </body>
    </html>
  );
}
