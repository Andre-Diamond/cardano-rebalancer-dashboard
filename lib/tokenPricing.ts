import axios from "axios";

// Attempts to fetch token price in ADA from public DEX APIs.
// Currently tries common Minswap endpoints. If all fail, returns 0.
// policyId: hex string; assetNameHex: hex asset name
export async function fetchTokenPriceInAda(policyId: string, assetNameHex: string): Promise<number> {
    const candidates: string[] = [
        // Potential Minswap endpoints (subject to change). These calls are best-effort.
        `https://api-mainnet-prod.minswap.org/asset/${policyId}.${assetNameHex}`,
        `https://api-mainnet-prod.minswap.org/api/v1/asset/${policyId}.${assetNameHex}`,
        `https://api.minswap.org/asset/${policyId}.${assetNameHex}`,
    ];

    for (const url of candidates) {
        try {
            console.log(`[pricing][ADA] GET ${url}`);
            const res = await axios.get(url, { timeout: 4000 });
            // Try a few common shapes
            const data = res.data;
            // Example shapes we might encounter:
            // { price: { ada: number } }
            // { priceInAda: number }
            // { price: number }
            if (data && typeof data === 'object') {
                if (data.price && typeof data.price.ada === 'number' && isFinite(data.price.ada)) return data.price.ada;
                if (typeof data.priceInAda === 'number' && isFinite(data.priceInAda)) return data.priceInAda;
                if (typeof data.price === 'number' && isFinite(data.price)) return data.price;
            }
            console.warn(`[pricing][ADA] No usable price field in response from ${url}`);
        } catch (err) {
            console.warn(`[pricing][ADA] Failed to fetch ADA price from ${url}:`, (err as Error)?.message || err);
        }
    }
    return 0;
}

// Fetch USD prices from Kraken for multiple tickers in one call.
// Input tickers should be bare symbols (e.g., 'ADA', 'AGIX'). Returns a map TICKER->USD price.
export async function fetchKrakenUsdPricesForTickers(tickers: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const cleaned = Array.from(new Set((tickers || []).map(t => (t || '').toUpperCase()).filter(Boolean)));
    if (cleaned.length === 0) return out;

    // Build pairs like ADAUSD, AGIXUSD
    const pairs = cleaned.map(t => `${t}USD`).join(',');
    try {
        console.log(`[pricing][Kraken] Requesting pairs: ${pairs}`);
        const res = await axios.get(`https://api.kraken.com/0/public/Ticker?pair=${pairs}`, { timeout: 5000 });
        const result = res.data?.result || {};
        const keys = Object.keys(result);
        console.log(`[pricing][Kraken] Result keys: ${keys.join(',')}`);
        for (const key of keys) {
            const last = result[key]?.c?.[0];
            const price = last ? parseFloat(last) : 0;
            if (!price || !isFinite(price)) continue;
            // Try to map back: prefer exact TICKERUSD keys, else fallback by suffix and inclusion
            const matched = cleaned.find(t => key.toUpperCase() === `${t}USD` || (key.toUpperCase().endsWith('USD') && key.toUpperCase().includes(t)));
            if (matched) {
                out.set(matched, price);
                console.log(`[pricing][Kraken] Matched ${matched} -> $${price} (key=${key})`);
            }
        }
        const missing = cleaned.filter(t => !out.has(t));
        if (missing.length > 0) console.warn(`[pricing][Kraken] No price for tickers: ${missing.join(', ')}`);
    } catch (err) {
        console.error(`[pricing][Kraken] Error fetching pairs: ${pairs}:`, (err as Error)?.message || err);
    }
    // Fallback: Try CoinGecko simple price
    try {
        // Map tickers to CoinGecko ids where possible.
        // Extend this map as you add support for more tokens.
        const COINGECKO_TICKER_MAP: Record<string, string> = {
            // Common Cardano tokens
            ADA: 'cardano',
            AGIX: 'singularitynet',
            RJV: 'rejuve-ai',
            COPI: 'cornucopias',
            // DJED handled separately; included for completeness
            DJED: 'djed',
        };
        const ids = cleaned
            .map(t => COINGECKO_TICKER_MAP[t] || t.toLowerCase())
            .join(',');
        console.log(`[pricing][CoinGecko] Requesting ids: ${ids}`);
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { timeout: 5000 });
        const data = res.data || {};
        for (const t of cleaned) {
            const id = COINGECKO_TICKER_MAP[t] || t.toLowerCase();
            const p = data?.[id]?.usd;
            if (p && isFinite(p)) {
                // Do not overwrite existing Kraken values
                if (!out.has(t)) {
                    out.set(t, Number(p));
                    console.log(`[pricing][CoinGecko] Matched ${t} (${id}) -> $${p}`);
                }
            }
        }
    } catch (err) {
        console.error(`[pricing][CoinGecko] Error fetching simple price:`, (err as Error)?.message || err);
    }
    return out;
}


