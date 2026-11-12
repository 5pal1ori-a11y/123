import { getPlatformAdminSession } from "@/lib/session-server";
import { PlatformAdminDashboard } from "@/components/platform/platform-admin-dashboard";
import { PlatformAdminLoginForm } from "@/components/platform/platform-admin-login-form";
import { QuartzShell } from "@/components/ui/quartz-shell";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  let session = null;
  try {
    session = await getPlatformAdminSession();
  } catch {
    session = null;
  }

  if (!session) {
    return (
      <QuartzShell tone="admin">
        <PlatformAdminLoginForm />
      </QuartzShell>
    );
  }

  return (
    <QuartzShell tone="admin">
      <PlatformAdminDashboard />
    </QuartzShell>
  );
}
