import { notFound } from "next/navigation";

import { Gift, Percent } from "lucide-react";

import { getShopBySlug, listEvents, listProducts } from "@/lib/store";

import { formatDate, formatKRW } from "@/lib/utils";



export const dynamic = "force-dynamic";



export default async function EventsPage({ params }: { params: Promise<{ shop: string }> }) {

  const { shop: slug } = await params;

  const shop = getShopBySlug(slug);

  if (!shop) notFound();

  const events = listEvents(shop.id);

  const products = listProducts(shop.id);



  return (

    <div className="space-y-4">

      <h1 className="flex items-center gap-2 text-xl font-bold">

        <Gift className="size-6 text-white/80" /> 이벤트

      </h1>

      {events.length === 0 ? (

        <div className="glass p-8 text-center text-neutral-400">진행 중인 이벤트가 없어요.</div>

      ) : (

        events.map((ev) => {

          const product = products.find((p) => p.id === ev.productId);

          const discounted = product

            ? Math.round(product.price * (1 - ev.discountPercent / 100))

            : null;

          return (

            <article key={ev.id} className="glass-thick overflow-hidden">

              <div className="border-b border-white/10 bg-white/[0.04] px-5 py-3">

                <span className="ios-pill text-neutral-300">

                  <Percent className="size-3" /> {ev.discountPercent}% OFF

                </span>

              </div>

              <div className="p-5">

                <h2 className="text-lg font-bold">{ev.title}</h2>

                <p className="mt-2 text-sm text-neutral-400">{ev.description}</p>

                {product && discounted !== null && (

                  <p className="mt-3 text-sm">

                    {product.name}:{" "}

                    <span className="text-neutral-500 line-through">{formatKRW(product.price)}</span>{" "}

                    <span className="font-bold text-white">{formatKRW(discounted)}</span>

                  </p>

                )}

                <p className="mt-3 text-xs text-neutral-500">~ {formatDate(ev.endsAt)} 까지</p>

              </div>

            </article>

          );

        })

      )}

    </div>

  );

}

