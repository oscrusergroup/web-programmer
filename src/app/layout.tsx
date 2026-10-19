import type { Metadata } from "next";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";
export const metadata: Metadata = {
  title: "OSCR Programmer · Firmware programmer",
  description:
    "Configure, build and upload Open Source Cartridge Reader firmware directly from your browser.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
