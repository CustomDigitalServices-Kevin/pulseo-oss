import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { ThemeProvider } from "@/components/common/theme-provider";
import { CookieInfoBanner } from "@/components/legal/cookie-info-banner";
import { appConfig } from "@/config/app-config";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function resolvePublicAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.NODE_ENV === "production") {
    if (fromEnv && !fromEnv.includes("localhost") && !fromEnv.startsWith("http://")) {
      return fromEnv;
    }
    return appConfig.appUrl;
  }
  return fromEnv ?? "http://localhost:3000";
}

const PUBLIC_APP_URL = resolvePublicAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_APP_URL),
  title: {
    default: `${appConfig.name} | ${appConfig.tagline}`,
    template: `%s · ${appConfig.name}`,
  },
  description: appConfig.companyDescription,
  applicationName: appConfig.name,
  authors: [{ name: appConfig.companyName }],
  keywords: [appConfig.name.toLowerCase(), "support", "tickets", "contracts", "client portal"],
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: appConfig.name,
    title: `${appConfig.name} : ${appConfig.tagline}`,
    description: appConfig.tagline,
    locale: "en_US",
    url: PUBLIC_APP_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${appConfig.name} : ${appConfig.tagline}`,
    description: appConfig.tagline,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
          <CookieInfoBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
