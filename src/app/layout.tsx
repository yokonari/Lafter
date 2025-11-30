/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'Lafter | ネタ動画検索アプリ',
  description:
    'お笑い芸人の公式YouTubeチャンネルから、漫才・コントなどのネタ動画だけを検索できるサービス。',
  metadataBase: new URL('https://lafter.day'),

  openGraph: {
    title: 'Lafter | ネタ動画検索アプリ',
    description: 'お笑い芸人の公式YouTubeチャンネルのネタ動画だけを集めて検索できるサービス。',
    url: 'https://lafter.day',
    siteName: 'Lafter',
    type: 'website',
    images: [
      {
        url: 'https://lafter.day/ogp.png',
        width: 1200,
        height: 630,
        alt: 'Lafter | ネタ動画検索アプリ',
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

      <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7810898957058616" crossOrigin="anonymous"></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
