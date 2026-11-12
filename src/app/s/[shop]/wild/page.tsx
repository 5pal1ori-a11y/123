import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findShopBySlug, initStore } from "@/lib/store";
import { initStoreKvOnly } from "@/lib/store-init";
import { VoxelClient } from "@/components/voxel/voxel-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "DOES MC 야생" };

export default async function WildPage({ params }: { params: Promise<{ shop: string }> }) {
  try {
    await initStore();
  } catch {
    await initStoreKvOnly();
  }
  const { shop: slug } = await params;
  if (!findShopBySlug(slug)) notFound();
  return <VoxelClient shopSlug={slug} mode="wild" />;
}
