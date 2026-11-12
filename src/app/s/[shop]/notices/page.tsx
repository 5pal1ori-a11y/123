import { Bell, Pin } from "lucide-react";

import { getShopBySlug, listNotices } from "@/lib/store";

import { formatDate } from "@/lib/utils";

import { notFound } from "next/navigation";



export const dynamic = "force-dynamic";



export default async function NoticesPage({ params }: { params: Promise<{ shop: string }> }) {

  const { shop: slug } = await params;

  const shop = getShopBySlug(slug);

  if (!shop) notFound();

  const notices = listNotices(shop.id);



  return (

    <div className="space-y-4">

      <h1 className="flex items-center gap-2 text-xl font-bold">

        <Bell className="size-6 text-white/80" /> 공지사항

      </h1>

      {notices.length === 0 ? (

        <div className="glass p-8 text-center text-neutral-400">아직 공지가 없어요.</div>

      ) : (

        notices.map((n) => (

          <article key={n.id} className="glass-thick p-5">

            <div className="flex items-start justify-between gap-2">

              <h2 className="font-semibold">{n.title}</h2>

              {n.pinned && <Pin className="size-4 shrink-0 text-white/70" />}

            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">

              {n.body}

            </p>

            <p className="mt-3 text-xs text-neutral-500">{formatDate(n.createdAt)}</p>

          </article>

        ))

      )}

    </div>

  );

}

