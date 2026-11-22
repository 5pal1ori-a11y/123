import { MFA_SITE_ORIGIN } from "@/lib/domain";
import type { Metadata, Viewport } from "next";
import { Do_Hyeon, Geist, Inter, JetBrains_Mono, Noto_Sans_KR, Space_Grotesk } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import { COMPONENT_EMBED_URL } from "@/lib/discord/component-embed";
import "./globals.css";
import "./does-features.css";
import "./does-world.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

const noto = Noto_Sans_KR({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const doHyeon = Do_Hyeon({
  variable: "--font-dohyeon",
  subsets: ["latin"],
  weight: "400",
});

export const viewport: Viewport = {
  themeColor: "#050506",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(`${MFA_SITE_ORIGIN}`),
  title: { default: "DOES · 마인크래프트 정품 계정 샵", template: "%s · DOES" },
  description: "한국 마인크래프트 정품 계정 샵 · 거래소 — 자동 자판기, 16자리 코드 안전 전달, 30일 보증.",
  icons: {
    icon: "/does-logo.png",
    apple: "/does-logo.png",
  },
  openGraph: {
    title: "DOES · 마인크래프트 정품 계정 샵",
    description: "자동 자판기 · 16자리 코드 안전 전달 · 30일 보증 · 계좌이체/코인/컬쳐랜드 자동 입금",
    url: `${MFA_SITE_ORIGIN}`,
    siteName: "DOES",
    images: [{ url: "/brand/does-banner.png", width: 1500, height: 500 }],
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "DOES · 마인크래프트 정품 계정 샵",
    description: "자동 자판기 · 16자리 코드 안전 전달 · 30일 보증",
    images: ["/brand/does-banner.png"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DOES",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 디스코드 링크 미리보기를 버튼 달린 V2 카드로 (Component Embed) */}
        <link rel="discord:component-embed" type="application/json" href={COMPONENT_EMBED_URL} />
      </head>
      <body
        className={`${inter.variable} ${noto.variable} ${geistSans.variable} ${jetbrains.variable} ${spaceGrotesk.variable} ${doHyeon.variable} antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.classList.remove("light");document.documentElement.setAttribute("data-admin-theme","dark")}catch(e){}})();`,
          }}
        />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
