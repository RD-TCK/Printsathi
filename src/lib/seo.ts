import type { Metadata } from "next";
import { getAppUrl } from "@/lib/env";

export const SITE_NAME = "Printiva";
export const SITE_TAGLINE = "Scan. Upload. Pay. Print.";
export const SITE_DESCRIPTION =
  "Printiva is a digital printing service platform for local print shops in India. Customers scan a shop QR code, upload documents from their phone, pay online or at the counter, and the shop's printer prints automatically.";

export const SITE_KEYWORDS = [
  "Printiva",
  "digital printing service",
  "online printing service",
  "document printing online",
  "print shop near me",
  "print documents from phone",
  "QR code printing",
  "print shop software",
  "print shop management software India",
  "automatic printing software",
  "xerox shop software",
  "cyber cafe printing software",
  "PDF printing online",
  "colour printout near me",
  "pay and print",
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
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  absoluteTitle?: boolean;
}): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    keywords: keywords ? [...keywords, ...SITE_KEYWORDS.slice(0, 6)] : undefined,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: "en_IN",
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
      "Digital printing",
      "Document printing",
      "Print shop automation",
      "QR code ordering",
      "Online payments for print shops",
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
    name: `${SITE_NAME} print shop automation`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Windows 10, Windows 11",
    url: siteUrl("/"),
    description:
      "QR ordering, automatic page counting and pricing, Razorpay payments, and a Windows desktop agent that sends paid jobs straight to the shop's printer.",
    publisher: { "@id": organizationId() },
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
