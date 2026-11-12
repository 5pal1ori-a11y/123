import { ClientRedirect } from "@/components/ui/client-redirect";

export const dynamic = "force-dynamic";

export default function GiftPage() {
  return <ClientRedirect href="/dashboard?tab=attendance" />;
}
