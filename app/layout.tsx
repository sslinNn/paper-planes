import type { Metadata, Viewport } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({ variable: "--font-display", subsets: ["latin"], weight: "variable" });
const text = Archivo({ variable: "--font-text", subsets: ["latin"], weight: "variable" });

const title = "Paper Planes";
const description = "Every reply on X is a paper plane flying across the world. Log in and yours take off.";

// превью ссылки в X: картинка — app/opengraph-image.jpg и twitter-image.jpg (скриншот карты)
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://127.0.0.1:3000",
  ),
  title,
  description,
  openGraph: { title, description, siteName: title, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#ecebe4" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
