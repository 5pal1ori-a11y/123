import { TicketPanelClient } from "@/components/ticket/ticket-panel-client";

export const dynamic = "force-dynamic";

export default async function TicketGuildPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  if (!/^\d{5,30}$/.test(guildId)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07080a] text-neutral-400">
        잘못된 서버 ID입니다.
      </div>
    );
  }
  return <TicketPanelClient guildId={guildId} />;
}
