import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({ variable: "--font-display", subsets: ["latin"], weight: "variable" });
const text = Archivo({ variable: "--font-text", subsets: ["latin"], weight: "variable" });

export const metadata: Metadata = {
  title: "Paper Planes",
  description: "Every reply on X is a paper plane flying across the world.",
};

export const viewport: Viewport = { themeColor: "#ecebe4" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
