import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;

// 로컬 개발(next dev)에서만 Cloudflare 바인딩을 붙인다. 프로덕션 빌드에서는 원격 세션이 필요 없다.
if (process.env.NODE_ENV === "development") {
  void import("@opennextjs/cloudflare").then(({ initOpenNextCloudflareForDev }) => initOpenNextCloudflareForDev());
}