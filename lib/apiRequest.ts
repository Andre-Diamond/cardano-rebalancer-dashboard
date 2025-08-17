// ../lib/apiRequest.ts

const inflightRequests = new Map<string, Promise<unknown>>();
const recentResponses = new Map<string, { ts: number; data: unknown }>();

function buildKey(url: string, options: RequestInit): string {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : '';
  return `${method}:${url}:${body}`;
}

export async function apiRequest<T>(url: string, options: RequestInit): Promise<T> {
  const key = buildKey(url, options);
  const now = Date.now();

  // If we have a very recent successful response, return it to avoid duplicate calls on quick remounts
  const recent = recentResponses.get(key);
  if (recent && (now - recent.ts) < 300) {
    return recent.data as T;
  }

  // Coalesce concurrent requests for the same key
  const inflight = inflightRequests.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const p = (async () => {
    const res = await fetch(url, { ...options, cache: 'no-cache' });
    if (!res.ok) throw new Error('Network response was not ok');
    const json = await res.json();
    recentResponses.set(key, { ts: Date.now(), data: json });
    return json as T;
  })()
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, p);
  return p as Promise<T>;
}

