import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Google Realtime Audio",
  description: "Gemini Live API realtime audio chat starter"
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
