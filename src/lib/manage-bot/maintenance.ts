import { initManageStore } from "@/lib/manage-bot/store";
import { expireDueBanners, runScheduledPartnerPosts } from "@/lib/manage-bot/service";

export async function runManageMaintenance() {
  await initManageStore({ force: true });
  const expired = await expireDueBanners().catch((err) => {
    console.error("[manage-expire]", err);
    return { expired: 0, error: String(err) };
  });
  const partner = await runScheduledPartnerPosts().catch((err) => {
    console.error("[manage-partner]", err);
    return { ran: 0, error: String(err) };
  });
  return { expired, partner };
}
