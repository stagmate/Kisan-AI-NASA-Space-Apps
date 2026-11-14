// Small shared helpers for calling outside data services.

export class SourceError extends Error {
  constructor(source, message) {
    super(`${source}: ${message}`);
    this.source = source;
  }
}

/** fetch JSON with a timeout; throws SourceError with a short reason on failure. */
export async function fetchJson(source, url, { fetchImpl = fetch, timeoutMs = 30_000, headers = {}, method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetchImpl(url, {
      method,
      body,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new SourceError(source, err.name === 'TimeoutError' ? 'timed out' : 'could not connect');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data == null) {
    const reason = data?.reason || data?.message || data?.detail || `HTTP ${res.status}`;
    throw new SourceError(source, String(reason).slice(0, 200));
  }
  if (data.error === true) throw new SourceError(source, String(data.reason || 'error').slice(0, 200));
  return data;
}

/** Tiny in-memory cache (per serverless instance) keyed by string. */
export function makeCache(ttlMs) {
  const store = new Map();
  return async (key, load, now = Date.now()) => {
    const hit = store.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value;
    const value = await load();
    store.set(key, { at: now, value });
    return value;
  };
}

export const roundCoord = (n) => Math.round(Number(n) * 100) / 100;
