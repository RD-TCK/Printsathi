import type { Metadata } from "next";
import { getAppUrl } from "@/lib/env";

export const SITE_NAME = "Printiva";
export const SITE_TAGLINE = "#1 Print Automation Software & Photocopy Management System";
export const SITE_DESCRIPTION =
  "Printiva is India's leading print automation software and photocopy management system for print shops, xerox stores, and cyber cafes. Customers scan a counter QR code, upload documents from their phone, and paid files print automatically on your Windows printer.";

export const SITE_KEYWORDS = [
  "printing software",
  "print automation software",
  "printing software for Windows",
  "printing software for shop",
  "photocopy software",
  "photocopy shop software",
  "xerox shop software",
  "xerox shop billing software",
  "print shop management software",
  "automatic printing software",
  "digital printing service",
  "cyber cafe printing software",
  "cloud printing software India",
  "print queue management software",
  "print shop billing software",
  "automatic print spooler software",
  "QR code printing software",
  "UPI print shop software",
  "Windows printer automation",
  "document printing online",
  "online printing service India",
  "xerox shop billing and printing",
  "colour printout near me",
  "print shop near me",
  "pay and print",
  "Printiva",
];

export function siteUrl(path = "/") {
  return new URL(path, `${getAppUrl()}/`).toString();
}

/** Per-page metadata with a canonical URL and matching Open Graph / Twitter cards. */
export function pageMetadata({
  title,
  description,
  path,
  keywords,
  absoluteTitle = false,
  locale = "en_IN",
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  absoluteTitle?: boolean;
  locale?: string;
}): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords: keywords ? [...keywords, ...SITE_KEYWORDS.slice(0, 10)] : SITE_KEYWORDS.slice(0, 10),
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      locale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: socialTitle, description },
  };
}

/** Keeps private workspaces and token-bearing pages out of search indexes. */
export const NO_INDEX: Metadata["robots"] = { index: false, follow: false };

const organizationId = () => `${siteUrl("/")}#organization`;
const websiteId = () => `${siteUrl("/")}#website`;

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId(),
    name: SITE_NAME,
    url: siteUrl("/"),
    logo: siteUrl("/icon.png"),
    description: SITE_DESCRIPTION,
    areaServed: { "@type": "Country", name: "India" },
    knowsAbout: [
      "Print automation software",
      "Photocopy software",
      "Printing software",
      "Xerox shop software",
      "Digital printing service",
      "Print shop management software",
      "QR code ordering",
      "Online payments for print shops",
      "Automatic print spooling",
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId(),
    name: SITE_NAME,
    alternateName: `${SITE_NAME} — ${SITE_TAGLINE}`,
    url: siteUrl("/"),
    description: SITE_DESCRIPTION,
    inLanguage: "en-IN",
    publisher: { "@id": organizationId() },
  };
}

export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${SITE_NAME} — Print Automation Software & Photocopy System`,
    alternateName: [
      "Print Automation Software",
      "Photocopy Software",
      "Printing Software",
      "Xerox Shop Software",
      "Print Shop Management Software",
    ],
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Windows 10, Windows 11",
    softwareVersion: "1.8.36",
    url: siteUrl("/"),
    description:
      "India's #1 print automation software and photocopy management system. Automate customer QR document intake, instant per-page pricing, Razorpay UPI payments, and physical Windows printing.",
    keywords:
      "printing software, print automation software, printing software for Windows, photocopy software, xerox shop software, print shop management software, automatic printing software",
    publisher: { "@id": organizationId() },
    featureList: [
      "Automated native Windows printing without manual download",
      "QR-code ordering from customer phone with zero app installation",
      "Instant PDF, Word, Excel, and image auto-pricing and page-counting",
      "Split-queue hardware routing for color and monochrome printers",
      "Integrated UPI, card, and counter cash payments via Razorpay",
      "Hardware duplex (double-sided) print support for all major printers",
    ],
    offers: [
      {
        "@type": "Offer",
        name: "7-day trial",
        price: "100",
        priceCurrency: "INR",
        url: siteUrl("/pricing"),
      },
      {
        "@type": "Offer",
        name: "Monthly plan",
        price: "699",
        priceCurrency: "INR",
        url: siteUrl("/pricing"),
      },
      {
        "@type": "Offer",
        name: "Yearly plan",
        price: "7499",
        priceCurrency: "INR",
        url: siteUrl("/pricing"),
      },
    ],
  };
}

export function serviceJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Digital printing service",
    serviceType: "Document printing",
    provider: { "@id": organizationId() },
    areaServed: { "@type": "Country", name: "India" },
    url: siteUrl("/digital-printing-service"),
    description:
      "Upload PDFs, Word files, presentations, spreadsheets, or photos from your phone and get them printed at a local print shop. Choose colour or black and white, paper size, page ranges, copies, and single or double-sided printing, then pay online or at the counter.",
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: siteUrl("/shops"),
      name: "Find a print shop",
    },
  };
}

export function faqJsonLd(items: ReadonlyArray<readonly [question: string, answer: string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export function howToJsonLd({
  name,
  description,
  steps,
}: {
  name: string;
  description: string;
  steps: ReadonlyArray<{ title: string; desc: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.desc,
    })),
  };
}

export function breadcrumbJsonLd(trail: ReadonlyArray<readonly [name: string, path: string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: siteUrl(path),
    })),
  };
}

export function blogPostingJsonLd({
  title,
  description,
  path,
  publishedAt,
  updatedAt,
  keywords,
  inLanguage = "en-IN",
}: {
  title: string;
  description: string;
  path: string;
  publishedAt: string;
  updatedAt?: string;
  keywords?: string[];
  inLanguage?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    url: siteUrl(path),
    mainEntityOfPage: { "@type": "WebPage", "@id": siteUrl(path) },
    datePublished: publishedAt,
    dateModified: updatedAt || publishedAt,
    inLanguage,
    keywords: keywords?.join(", "),
    author: { "@type": "Organization", name: SITE_NAME, url: siteUrl("/") },
    publisher: { "@id": organizationId() },
    image: siteUrl("/opengraph-image"),
  };
}
