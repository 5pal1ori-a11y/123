"use client";

import { BadgeCheck } from "lucide-react";
import { BotDiscordLogin } from "@/components/bot-discord-login";

export function VerifyHomeLogin() {
  return <BotDiscordLogin product="verify" icon={<BadgeCheck className="size-5" />} />;
}
