import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { JsonLd } from "@/components/json-ld";
import { getAppUrl } from "@/lib/env";
import {
  organizationJsonLd,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  websiteJsonLd,
} from "@/lib/seo";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});

const defaultTitle = `${SITE_NAME} — #1 Print Automation Software & Photocopy Management System`;

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: defaultTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "business",
  formatDetection: { telephone: false, email: false, address: false },
  alternates: {
    canonical: "/",
    types: {
      "text/plain": "/llms.txt",
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: "/",
    title: defaultTitle,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || "Jlf3PdAfou6wTbOornnnBkJf6VxmytDZpb72_u-7gDM",
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    shortcut: "/favicon.ico",
    apple: { url: "/icon.png", sizes: "512x512", type: "image/png" },
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
};

const themeInitScript = `
(function(){
  try {
    var p = (window.location && window.location.pathname) || '';
    var isShopConfigPage = p.indexOf('/shop/') === 0 && !/^\\/shop\\/(dashboard|jobs|pricing|printer|qr|settings|analytics|subscription)(\\/|$)/.test(p) && p !== '/shop' && p !== '/shop/';
    var saved = window.localStorage.getItem('printiva-theme');
    if (!isShopConfigPage && saved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN" className={`${inter.variable} ${serif.variable}`} suppressHydrationWarning>
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        {children}
      </body>
    </html>
  );
}
