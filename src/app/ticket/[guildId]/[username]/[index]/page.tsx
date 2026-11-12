import { TicketTranscriptClient } from "@/components/ticket/ticket-transcript-client";

export const dynamic = "force-dynamic";

export default async function TicketTranscriptPage({
  params,
}: {
  params: Promise<{ guildId: string; username: string; index: string }>;
}) {
  const { guildId, username, index } = await params;
  if (!/^\d{5,30}$/.test(guildId) || !/^\d+$/.test(index)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#313338] text-neutral-400">
        잘못된 주소입니다.
      </div>
    );
  }
  return (
    <TicketTranscriptClient
      guildId={guildId}
      usernameSlug={decodeURIComponent(username)}
      index={Number(index)}
    />
  );
}
