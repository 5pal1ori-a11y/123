import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Platform Admin",
  robots: { index: false, follow: false },
};

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
