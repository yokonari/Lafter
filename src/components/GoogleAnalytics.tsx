"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

export const GoogleAnalytics = () => {
    const pathname = usePathname();

    // 管理画面ではGAを読み込まない
    if (pathname?.startsWith("/admin")) {
        return null;
    }

    return (
        <>
            <Script
                src="https://www.googletagmanager.com/gtag/js?id=G-204FB6PCV8"
                strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
                {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-204FB6PCV8');
        `}
            </Script>
        </>
    );
};
