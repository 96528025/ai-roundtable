import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Roundtable",
  description: "Turn one product idea into an evidence-aware pre-build decision."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
