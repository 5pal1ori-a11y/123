/** Keep background Discord work alive on Cloudflare Workers */

import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Register `task` with the current request's `waitUntil` when available.
 * Must call waitUntil synchronously — delaying via async resolve races the
 * Worker freezing after the HTTP response is sent (Discord logs never post).
 */
export function scheduleDiscordBackground(task: Promise<unknown>) {
  const safe = Promise.resolve(task).catch((err) => {
    console.error("[discord] background task failed", err);
  });

  try {
    const { ctx } = getCloudflareContext();
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(safe);
      return;
    }
  } catch {
    /* local / outside request */
  }

  void safe;
}
