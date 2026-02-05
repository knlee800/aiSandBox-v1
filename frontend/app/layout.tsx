import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Sandbox",
  description: "Build applications with AI assistance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
