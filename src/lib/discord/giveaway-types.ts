export type Giveaway = {
  id: string;
  shopSlug: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  description: string;
  winners: number;
  hostId: string;
  createdAt: number;
  endsAt: number;
  entrants: string[];
  ended: boolean;
  winnerIds: string[];
  renderedAt: number;
  /** 서버 태그 착용자만 참여 가능 */
  requireTag?: boolean;
};
