import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findShopBySlug, initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { WorldClient } from "@/components/world/world-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "DOES MC 월드" };

export default async function MainWorldPage({ params }: { params: Promise<{ shop: string }> }) {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }
  const { shop: slug } = await params;
  if (!findShopBySlug(slug)) notFound();
  return <WorldClient shopSlug={slug} />;
}
