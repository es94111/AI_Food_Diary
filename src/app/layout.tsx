import type { Metadata, Viewport } from "next";
import { PwaStatus } from "@/components/pwa-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Food Diary",
  description: "用 AI 記錄飲食、估算營養並提供下一餐建議",
  manifest: "/manifest.webmanifest"
};

export const viewport: Viewport = {
  themeColor: "#b45309"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="AI Food Diary" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <PwaStatus />
        {children}
      </body>
    </html>
  );
}
