import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Roundtable",
  description: "Let your personal advisory board debate your idea."
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
