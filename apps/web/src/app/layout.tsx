import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { APP_NAME } from "@kedge/config";
import { Providers } from "@/components/providers";
import { themeScript } from "@/components/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Double-entry accounting for Nigerian businesses and the firms that serve them.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1113" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before paint. Static string, no user input. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
