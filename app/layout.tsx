import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const BASE = process.env.BASE_PATH?.replace(/\/$/, "") ?? "";

export const metadata: Metadata = {
  title: "Blueprint — a thinking board",
  applicationName: "Blueprint",
  appleWebApp: { capable: true, title: "Blueprint", statusBarStyle: "black-translucent" },
  icons: {
    icon: { url: `${BASE}/icon.svg`, type: "image/svg+xml" },
    apple: `${BASE}/icons/apple-touch-icon.png`,
  },
  description:
    "Collect evidence, say how sure you are, link it up, and let the board point out where your reasoning — or your plan — doesn't hold.",
};

export const viewport: Viewport = { themeColor: "#0b335f", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden font-sans">{children}</body>
    </html>
  );
}
