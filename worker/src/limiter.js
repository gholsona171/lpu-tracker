// Best-effort per-isolate limiter. Cloudflare may run several isolates; that is acceptable for the beta.
// The limit is generous because guests on the venue Wi-Fi share one IP address.
export function createLimiter({ max = 40, windowMs = 600000 } = {}) {
  const hits = new Map();
  return {
    allow(key, now = Date.now()) {
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (list.length >= max) { hits.set(key, list); return false; }
      list.push(now); hits.set(key, list);
      if (hits.size > 5000) hits.clear();
      return true;
    },
  };
}
