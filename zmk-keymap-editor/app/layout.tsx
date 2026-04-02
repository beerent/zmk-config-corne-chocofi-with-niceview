import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZMK Keymap Editor",
  description: "Chat-driven ZMK keymap editor powered by Claude",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
