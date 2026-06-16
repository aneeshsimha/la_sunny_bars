import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import { Analytics } from "@vercel/analytics/react";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LA Sunny Bars",
  description:
    "See which bar and restaurant patios in LA are getting sunlight right now",
  manifest: "/manifest.json",
  themeColor: "#f59e0b",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LA Sunny Bars",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body style={{ fontFamily: "var(--font-body)" }}>
        {children}
        <InstallPrompt />
        <Analytics />
      </body>
    </html>
  );
}
