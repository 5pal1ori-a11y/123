"use client";

import { BotDiscordLogin } from "@/components/bot-discord-login";
import { Settings2 } from "lucide-react";

export function ManageHomeLogin() {
  return <BotDiscordLogin product="manage" icon={<Settings2 className="size-5" />} />;
}
