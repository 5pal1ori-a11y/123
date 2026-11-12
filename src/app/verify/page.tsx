import { headers } from "next/headers";
import { isMfaSiteHost } from "@/lib/domain";
import { MfaVerifyLogin } from "@/components/verify/mfa-verify-login";
import { VerifyHomeLogin } from "@/components/verify/verify-home-login";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const host = (await headers()).get("host") ?? "";
  if (isMfaSiteHost(host)) {
    return {
      title: "DOES 인증",
      description: "Discord 서버 인증 · 자판기 통합",
    };
  }
  return {
    title: "DOES Verify",
    description: "Discord 서버 인증봇 웹패널",
  };
}

export default async function VerifyHomePage() {
  const host = (await headers()).get("host") ?? "";
  if (isMfaSiteHost(host)) return <MfaVerifyLogin />;
  return <VerifyHomeLogin />;
}
