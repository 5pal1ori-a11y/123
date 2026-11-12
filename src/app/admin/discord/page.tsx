import { QuartzShell } from "@/components/ui/quartz-shell";
import { ApexAdminDiscordPick } from "@/components/admin/apex-admin-discord-pick";

export const dynamic = "force-dynamic";

export default function ApexAdminDiscordPage() {
  return (
    <QuartzShell tone="admin">
      <ApexAdminDiscordPick />
    </QuartzShell>
  );
}
