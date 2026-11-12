/** Client-safe sitekey accessor (no secrets). */
export function turnstileSiteKey() {
  return (
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VERIFY_TURNSTILE_SITE_KEY?.trim() ||
    ""
  );
}
