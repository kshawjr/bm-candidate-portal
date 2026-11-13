// Next.js 14 caches GET requests made through its patched global `fetch`,
// and supabase-js reads are plain GETs. Without this, a Supabase read can
// be answered from Next's cache instead of the database (e.g. a "not
// found" from before a row existed keeps being returned). Passing this as
// `global.fetch` to createClient makes every Supabase request skip that
// cache.
export const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });
