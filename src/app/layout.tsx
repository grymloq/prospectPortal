import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Swedish 40k National Team",
  description:
    "Game journals, training goals, matchups, and selection for the Swedish 40k National Team’s coaches and players.",
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
