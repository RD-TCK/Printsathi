import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PrintSathi | Scan. Upload. Pay. Print.",
    template: "%s | PrintSathi",
  },
  description: "A simpler way to print at your trusted local shop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
