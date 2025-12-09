/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Next.js 側が利用するメタデータの型を明示し、型安全に OGP 情報を配信します。
export const metadata: Metadata = {
  title: 'Lafter | ネタ動画検索サイト',
  description:
    'お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサービス。',
  metadataBase: new URL('https://lafter.day'),

  openGraph: {
    title: 'Lafter | ネタ動画検索サイト',
    description: 'お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサービス。',
    url: 'https://lafter.day',
    siteName: 'Lafter',
    type: 'website',
    images: [
      {
        url: 'https://lafter.day/ogp.png',
        width: 1200,
        height: 630,
        alt: 'Lafter | ネタ動画検索サイト',
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-title" content="Lafter" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />

      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-204FB6PCV8"
        />
        <Script id="google-analytics">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-204FB6PCV8');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
