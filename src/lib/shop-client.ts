export function shopHeaders(shopSlug: string, json = true): HeadersInit {
  const headers: Record<string, string> = {
    "x-orel-shop": shopSlug,
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}
