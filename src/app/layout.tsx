import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DiagramProvider } from "@/contexts/diagram-context";
import { ApiKeyProvider } from "@/contexts/api-key-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "e-ppt | AI 智能图表生成",
  description: "基于大模型工具调用能力，配合 draw.io 实现智能图表绘制",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ApiKeyProvider>
          <DiagramProvider>{children}</DiagramProvider>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
