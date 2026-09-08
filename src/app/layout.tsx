import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Team Sweden · National team selection",
  description:
    "The development and selection workspace for Sweden’s Warhammer 40,000 team.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
