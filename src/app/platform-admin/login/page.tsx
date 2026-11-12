import { getPlatformAdminSession } from "@/lib/session-server";
import { PlatformAdminLoginForm } from "@/components/platform/platform-admin-login-form";
import { ClientRedirect } from "@/components/ui/client-redirect";
import { QuartzShell } from "@/components/ui/quartz-shell";

export const dynamic = "force-dynamic";

export default async function PlatformAdminLoginPage() {
  let session = null;
  try {
    session = await getPlatformAdminSession();
  } catch {
    session = null;
  }

  if (session) {
    return (
      <QuartzShell tone="admin">
        <ClientRedirect href="/platform-admin" />
      </QuartzShell>
    );
  }

  return (
    <QuartzShell tone="admin">
      <PlatformAdminLoginForm />
    </QuartzShell>
  );
}
