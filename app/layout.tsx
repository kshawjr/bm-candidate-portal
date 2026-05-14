import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Candidate Portal",
  description: "Blue Maven franchise candidate portal",
};

// PR 118 (mobile foundation): `viewportFit: "cover"` is required for
// env(safe-area-inset-*) to report non-zero values on iOS — without
// it, the notch / home indicator overlap the page and the
// --safe-area-inset-* tokens in globals.css would always be 0.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
