/**
 * Rate-limited fetch wrapper using a simple token bucket.
 * Default: 60 requests per minute.
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requestsPerMinute: number;
}

const buckets = new Map<number, TokenBucket>();

function getBucket(requestsPerMinute: number): TokenBucket {
  let bucket = buckets.get(requestsPerMinute);
  if (!bucket) {
    bucket = { tokens: requestsPerMinute, lastRefill: Date.now(), requestsPerMinute };
    buckets.set(requestsPerMinute, bucket);
  }
  return bucket;
}

function refill(bucket: TokenBucket): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const tokensToAdd = (elapsed / 60_000) * bucket.requestsPerMinute;
  bucket.tokens = Math.min(bucket.requestsPerMinute, bucket.tokens + tokensToAdd);
  bucket.lastRefill = now;
}

async function waitForToken(bucket: TokenBucket): Promise<void> {
  refill(bucket);
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return;
  }
  // Calculate wait time until one token is available
  const msPerToken = 60_000 / bucket.requestsPerMinute;
  const waitMs = msPerToken * (1 - bucket.tokens);
  await new Promise<void>((resolve) => setTimeout(resolve, Math.ceil(waitMs)));
  bucket.tokens = 0;
  bucket.lastRefill = Date.now();
}

export async function rateLimitedFetch(
  url: string,
  options?: RequestInit,
  requestsPerMinute = 60
): Promise<Response> {
  const bucket = getBucket(requestsPerMinute);
  await waitForToken(bucket);
  return fetch(url, options);
}

const RETRY_DELAYS_MS = [30_000, 90_000, 300_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry on transient Overpass errors (429, 503, 504).
 * Uses exponential backoff: 15s → 45s → 90s.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) return response;
    if (![429, 503, 504].includes(response.status)) return response; // non-retryable
    if (attempt === RETRY_DELAYS_MS.length) return response; // out of retries, return for caller to handle
    const wait = RETRY_DELAYS_MS[attempt];
    console.warn(`[overpass] ${response.status} — retrying in ${wait / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})...`);
    lastError = new Error(`${response.status} ${response.statusText}`);
    await sleep(wait);
  }
  throw lastError;
}
