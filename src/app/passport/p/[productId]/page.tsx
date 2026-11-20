import { notFound, redirect } from "next/navigation";
import { getProductById, initStore } from "@/lib/store";
import { issuePassport } from "@/lib/passport";

export const dynamic = "force-dynamic";

/** 상품 페이지의 '계정 여권' 버튼 → 여권을 발급(처음이면)하고 여권 페이지로 보낸다 */
export default async function PassportForProduct({ params }: { params: Promise<{ productId: string }> }) {
  await initStore();
  const { productId } = await params;
  const p = getProductById(productId);
  if (!p || p.productKind !== "mc_account" || !p.mcNickname) notFound();
  const { no } = await issuePassport(p);
  redirect(`/passport/${no}`);
}
