import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Candidate Portal",
  description: "Blue Maven franchise candidate portal",
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
