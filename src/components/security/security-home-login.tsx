"use client";

import { Shield } from "lucide-react";
import { BotDiscordLogin } from "@/components/bot-discord-login";

export function SecurityHomeLogin() {
  return <BotDiscordLogin product="security" icon={<Shield className="size-5" />} />;
}
