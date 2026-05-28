import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Food Diary",
  description: "用 AI 記錄飲食、估算營養並提供下一餐建議"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
