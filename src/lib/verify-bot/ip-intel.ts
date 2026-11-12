export type IpIntel = {
  country: string | null;
  /** e.g. Seoul / Gyeonggi */
  region: string | null;
  city: string | null;
  asn: string | null;
  org: string | null;
  /** ISP / carrier name when available */
  isp: string | null;
  proxy: boolean;
  hosting: boolean;
  mobile: boolean;
  vpn: boolean;
  raw?: unknown;
};

export async function lookupIpIntel(
  ip: string | null,
  cfCountry: string | null,
): Promise<IpIntel> {
  const base: IpIntel = {
    country: cfCountry?.toUpperCase() || null,
    region: null,
    city: null,
    asn: null,
    org: null,
    isp: null,
    proxy: false,
    hosting: false,
    mobile: false,
    vpn: false,
  };
  if (!ip || ip === "127.0.0.1" || ip === "::1") return base;

  try {
    const url = `https://ipwho.is/${encodeURIComponent(ip)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      country_code?: string;
      region?: string;
      city?: string;
      connection?: {
        asn?: number | string;
        org?: string;
        isp?: string;
        type?: string;
      };
      security?: {
        vpn?: boolean;
        proxy?: boolean;
        tor?: boolean;
        relay?: boolean;
      };
      type?: string;
    } | null;
    if (!json || json.success === false) return base;
    const vpn = Boolean(json.security?.vpn || json.security?.tor || json.security?.relay);
    const proxy = Boolean(json.security?.proxy || vpn);
    const mobile = String(json.connection?.type || json.type || "")
      .toLowerCase()
      .includes("mobile");
    const asnNum = json.connection?.asn;
    const org = json.connection?.org?.trim() || null;
    const isp = json.connection?.isp?.trim() || org;
    return {
      country: (json.country_code || cfCountry || "").toUpperCase() || null,
      region: json.region?.trim() || null,
      city: json.city?.trim() || null,
      asn: asnNum != null ? `AS${asnNum}` : null,
      org,
      isp,
      proxy,
      hosting: Boolean(json.security?.proxy && !vpn),
      mobile,
      vpn,
      raw: json,
    };
  } catch {
    return base;
  }
}

/** Human-readable estimated location: city · region · country */
export function formatIpRegion(intel: Pick<IpIntel, "city" | "region" | "country">) {
  const parts = [intel.city, intel.region, intel.country].filter(Boolean);
  const uniq: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (uniq[uniq.length - 1]?.toLowerCase() === p.toLowerCase()) continue;
    uniq.push(p);
  }
  return uniq.join(" · ") || null;
}

export function evaluateIpPolicy(
  guild: {
    blockVpn: boolean;
    blockProxy: boolean;
    blockMobile: boolean;
    blockForeign: boolean;
    allowedCountries: string[];
  },
  intel: IpIntel,
): { ok: true; flags: string[] } | { ok: false; reason: string; flags: string[] } {
  const flags: string[] = [];
  if (intel.vpn || intel.proxy) flags.push("vpn_proxy");
  if (intel.hosting) flags.push("hosting");
  if (intel.mobile) flags.push("mobile");
  if (intel.country) flags.push(`cc:${intel.country}`);
  if (intel.asn) flags.push(`asn:${intel.asn}`);
  if (intel.isp) flags.push(`isp:${intel.isp.slice(0, 40)}`);

  if (guild.blockVpn && (intel.vpn || intel.proxy)) {
    return { ok: false, reason: "vpn", flags };
  }
  if (guild.blockProxy && (intel.proxy || intel.hosting)) {
    return { ok: false, reason: "proxy", flags };
  }
  if (guild.blockMobile && intel.mobile) {
    return { ok: false, reason: "mobile", flags };
  }
  if (guild.blockForeign) {
    const allowed = (guild.allowedCountries?.length ? guild.allowedCountries : ["KR"]).map((c) =>
      c.toUpperCase(),
    );
    if (!intel.country || !allowed.includes(intel.country)) {
      return { ok: false, reason: "foreign", flags };
    }
  }
  return { ok: true, flags };
}
