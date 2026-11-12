/**
 * Add wildcard CNAME * -> vendix.team (proxied) for shop subdomains.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx node scripts/add-wildcard-dns.mjs
 *
 * Create token at: Cloudflare Dashboard → My Profile → API Tokens
 * Permission: Zone → DNS → Edit (zone: vendix.team)
 */
const ZONE_NAME = "vendix.team";

function getToken() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN is required.\n" +
        "Create an API token with Zone.DNS Edit for vendix.team, then run:\n" +
        "  $env:CLOUDFLARE_API_TOKEN=\"your-token\"; node scripts/add-wildcard-dns.mjs",
    );
  }
  return token;
}

async function cf(method, resource, body) {
  const token = getToken();
  const res = await fetch(`https://api.cloudflare.com/client/v4${resource}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) {
    const msg = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    throw new Error(msg);
  }
  return json.result;
}

async function main() {
  const zones = await cf("GET", `/zones?name=${ZONE_NAME}`);
  const zone = zones[0];
  if (!zone) throw new Error(`Zone not found: ${ZONE_NAME}`);
  console.log(`Zone: ${zone.name} (${zone.id})`);

  const existing = await cf(
    "GET",
    `/zones/${zone.id}/dns_records?type=CNAME&name=${encodeURIComponent(`*.${ZONE_NAME}`)}`,
  );
  const starRecord = existing.find((r) => r.name === `*.${ZONE_NAME}`);

  if (starRecord) {
    console.log(`Wildcard exists: *.${ZONE_NAME} -> ${starRecord.content} (proxied=${starRecord.proxied})`);
    if (starRecord.content === ZONE_NAME && starRecord.proxied) {
      console.log("No changes needed.");
      return;
    }
    const updated = await cf("PATCH", `/zones/${zone.id}/dns_records/${starRecord.id}`, {
      type: "CNAME",
      name: "*",
      content: ZONE_NAME,
      proxied: true,
    });
    console.log(`Updated: *.${ZONE_NAME} -> ${updated.content} (proxied=${updated.proxied})`);
    return;
  }

  const created = await cf("POST", `/zones/${zone.id}/dns_records`, {
    type: "CNAME",
    name: "*",
    content: ZONE_NAME,
    proxied: true,
  });
  console.log(`Created: ${created.name} -> ${created.content} (proxied=${created.proxied})`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
