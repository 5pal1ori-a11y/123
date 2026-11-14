import type { Metadata, Viewport } from "next";
import { Do_Hyeon, Geist, Inter, JetBrains_Mono, Noto_Sans_KR, Space_Grotesk } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
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
  title: { default: "DOES", template: "%s · DOES" },
  description: "DOES MC 온라인 샵에 오신것을 환영합니다.",
  icons: {
    icon: "/does-logo.png",
    apple: "/does-logo.png",
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
