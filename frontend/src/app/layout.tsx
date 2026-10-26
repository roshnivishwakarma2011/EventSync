import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Assistant } from "@/components/assistant";

export const metadata: Metadata = {
  title: { default: "EventSync — Discover Events That Move You", template: "%s · EventSync" },
  description:
    "EventSync is an intelligent event discovery and experience platform — find experiences, connect with people, earn XP and make every event count.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="noise min-h-screen antialiased">
        <Providers>
          {children}
          <Assistant />
        </Providers>
      </body>
    </html>
  );
}
