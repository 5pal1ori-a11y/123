import { decryptSecret } from "@/lib/verify-bot/crypto";
import { refreshVerifyOAuthToken } from "@/lib/verify-bot/oauth";
import { addGuildMemberWithOAuth, formatJoinError } from "@/lib/verify-bot/rest";
import {
  listVerifyMembers,
  persistVerifyStore,
  upsertVerifyMember,
} from "@/lib/verify-bot/store";

export async function recoverMembersToGuild(opts: {
  sourceGuildId: string;
  targetGuildId: string;
  roleId?: string | null;
  onProgress?: (done: number, total: number) => void;
}) {
  const members = listVerifyMembers(opts.sourceGuildId).filter((m) => m.refreshTokenEnc);
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i]!;
    opts.onProgress?.(i + 1, members.length);
    const refresh = decryptSecret(member.refreshTokenEnc!);
    if (!refresh) {
      fail += 1;
      if (errors.length < 8) {
        errors.push(`${member.username}: 복구 토큰 복호화 실패(재인증 필요)`);
      }
      continue;
    }
    const token = await refreshVerifyOAuthToken(refresh);
    if ("error" in token) {
      fail += 1;
      if (errors.length < 8) {
        errors.push(`${member.username}: ${token.error} (재인증 필요)`);
      }
      continue;
    }
    if (token.refreshToken && token.refreshToken !== refresh) {
      upsertVerifyMember({
        guildId: member.guildId,
        discordUserId: member.discordUserId,
        username: member.username,
        refreshToken: token.refreshToken,
      });
    }

    const roles = opts.roleId ? [opts.roleId] : undefined;
    const add = await addGuildMemberWithOAuth(
      opts.targetGuildId,
      member.discordUserId,
      token.accessToken,
      roles,
    );

    if (add.joined && add.alreadyMember) {
      skipped += 1;
      ok += 1;
    } else if (add.joined) {
      ok += 1;
    } else {
      const msg = formatJoinError(add.json, add.status);
      if (add.status === 400 && msg.toLowerCase().includes("already")) {
        skipped += 1;
      } else {
        fail += 1;
        if (errors.length < 8) errors.push(`${member.username}: ${msg}`);
      }
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  await persistVerifyStore();
  return {
    total: members.length,
    ok,
    fail,
    skipped,
    errors,
  };
}
