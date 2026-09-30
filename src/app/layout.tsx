import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cartridge Lab · Firmware programmer",
  description:
    "Configure, build and upload Open Source Cartridge Reader firmware directly from your browser.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
