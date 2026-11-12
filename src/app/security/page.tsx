import { SecurityHomeLogin } from "@/components/security/security-home-login";

export const metadata = {
  title: "DOES Security",
  description: "Discord 보안봇 웹패널",
};

export default function SecurityHomePage() {
  return <SecurityHomeLogin />;
}
