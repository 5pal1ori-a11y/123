import { IdentityVerifyClient } from "@/components/verify/identity-verify-client";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return {
    title: "본인인증 · DOES",
    description: "안전한 거래를 위한 토스 본인인증",
  };
}

export default function VerifyIdentityPage() {
  return <IdentityVerifyClient />;
}
