import { ImageResponse } from "next/og";
import { fetchHypixelDetail, levelLine, LISTING_TABS, loadListing, statCells, type ListingTab } from "@/lib/discord/account-listing";
import { STAT_FONT_BASE64 } from "@/lib/discord/stat-font";
import { initStore } from "@/lib/store";
import { maskMcNickname } from "@/lib/mc-account";
import { fetchImage, skinRenderUrls } from "@/lib/mc-profile-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCENT: Record<ListingTab, string> = { bedwars: "#f472b6", skywars: "#38bdf8", duels: "#facc15" };

function fontData() {
  const bin = atob(STAT_FONT_BASE64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** 디스코드 판매 글의 스탯 이미지 — `<글ID>-<게임>-<시간>.png` (시간은 캐시 구분용) */
export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const m = /^([0-9a-f]{8})-(bedwars|skywars|duels)-\d{1,8}\.png$/.exec(file);
  if (!m) return new Response("not found", { status: 404 });
  await initStore().catch(() => null);
  const listing = await loadListing(m[1]!);
  if (!listing) return new Response("not found", { status: 404 });
  const tab = m[2] as ListingTab;
  const hy = await fetchHypixelDetail(listing.uuid);

  let skin: string | null = null;
  try {
    const img = await fetchImage(skinRenderUrls(listing.uuid));
    if (img) {
      const buf = new Uint8Array(await img.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
      skin = `data:image/png;base64,${btoa(bin)}`;
    }
  } catch {
    skin = null;
  }

  const accent = ACCENT[tab];
  const cells = statCells(tab, hy);
  const rows: [string, string | number][][] = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
  const title = `[${listing.prefix}] ${maskMcNickname(listing.name)}`;
  const height = 385 + Math.max(rows.length, 1) * 103;

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0b1224", padding: 28, color: "#fff", fontFamily: "Galmuri" }}>
        <div style={{ display: "flex", fontSize: 30, marginBottom: 16 }}>Account Stats</div>
        <div style={{ display: "flex", marginBottom: 18 }}>
          {LISTING_TABS.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                padding: "8px 22px",
                marginRight: 10,
                borderRadius: 10,
                fontSize: 18,
                background: t.id === tab ? "#1d3a8a" : "#131c33",
                border: t.id === tab ? "2px solid #3b82f6" : "2px solid #1f2a44",
                color: t.id === tab ? "#fff" : "#7c8aa8",
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, borderRadius: 16, border: `3px solid ${accent}`, background: "#101a30", padding: 20 }}>
          <div style={{ display: "flex", marginBottom: 16 }}>
            {skin ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={skin} width={150} height={190} style={{ objectFit: "contain", marginRight: 20 }} alt="" />
            ) : (
              <div style={{ display: "flex", width: 150, height: 190, marginRight: 20, background: "#0b1224", borderRadius: 10 }} />
            )}
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0", borderRadius: 10, background: "#1a2540", fontSize: 30 }}>{title}</div>
              <div style={{ display: "flex", justifyContent: "center", padding: "10px 0", marginTop: 10, borderRadius: 10, background: "#1a2540", fontSize: 22, color: "#cbd5e1" }}>
                {hy ? levelLine(tab, hy) : "No Hypixel data"}
              </div>
              <div style={{ display: "flex", justifyContent: "center", padding: "10px 0", marginTop: 10, borderRadius: 10, background: "#1a2540", fontSize: 20, color: accent }}>
                {hy?.rank ? `Hypixel [${hy.rank}]  Lv.${Math.floor(hy.level)}` : hy ? `Hypixel Lv.${Math.floor(hy.level)}` : ""}
              </div>
            </div>
          </div>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: "flex", marginBottom: 10 }}>
              {row.map(([label, value], ci) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, marginRight: ci === 2 ? 0 : 10, padding: "10px 0", borderRadius: 10, background: "#0b1224", border: "2px solid #1f2a44" }}>
                  <div style={{ display: "flex", fontSize: 17, color: "#4ade80" }}>{label}</div>
                  <div style={{ display: "flex", fontSize: 30, color: "#fbbf24", marginTop: 4 }}>
                    {typeof value === "number" ? value.toLocaleString("en-US") : value}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 760,
      height,
      fonts: [{ name: "Galmuri", data: fontData(), weight: 400, style: "normal" }],
      headers: { "cache-control": "public, max-age=3600" },
    },
  );
}
