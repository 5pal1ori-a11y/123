"use client";

import { Ticket } from "lucide-react";
import { BotDiscordLogin } from "@/components/bot-discord-login";

export function TicketHomeLogin() {
  return <BotDiscordLogin product="ticket" icon={<Ticket className="size-5" />} />;
}
