import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { koiosApi } from "../../../../lib/koios";
import { fetchAdaUsd } from "../../../../lib/pricing";
import { fetchKrakenUsdPricesForTickers } from "../../../../lib/tokenPricing";
import type { Token, Holding, KoiosAsset } from "../../../../types";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { walletId } = req.query as { walletId: string };
    const portfolioOnly = String(req.query.portfolioOnly || 'false') === 'true';

    const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id, address')
        .eq('id', walletId)
        .single();
    if (wErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    const { price: adaUsd, isFallback } = await fetchAdaUsd();
    const djedUsd = 1;

    // ADA amount
    const adaResp = await koiosApi.post('/address_info', { _addresses: [wallet.address] });
    const adaAmount = parseInt(adaResp.data?.[0]?.balance || '0', 10) / 1_000_000;

    // Token assets
    const assetResp = await koiosApi.post('/address_assets', { _addresses: [wallet.address] });
    const assets: KoiosAsset[] = Array.isArray(assetResp.data)
        ? (assetResp.data[0]?.asset_list ? assetResp.data[0].asset_list : assetResp.data)
        : [];

    // Load tokens registry and portfolio targets (if needed)
    const [{ data: tokens }, targetsResult] = await Promise.all([
        supabase.from('tokens').select('id, policy_id, asset_name, is_ada, ticker, name, decimals'),
        portfolioOnly ? supabase.from('wallet_portfolio_targets').select('token_id').eq('wallet_id', walletId) : Promise.resolve({ data: null })
    ] as const);

    const tokenByKey = new Map<string, Token>();
    (tokens || []).forEach((t: Token) => {
        tokenByKey.set(`${t.policy_id}:${t.asset_name}`, t);
    });
    const adaToken = (tokens || []).find(t => t.is_ada);

    const targetTokenIds = new Set<string>(Array.isArray(targetsResult?.data) ? (targetsResult!.data as Array<{ token_id: string }>).map((r) => r.token_id) : []);

    const holdings: Holding[] = [];
    const adaHolding = {
        token_id: adaToken?.id || null,
        policy_id: null,
        asset_name: null,
        ticker: adaToken?.ticker || 'ADA',
        name: adaToken?.name || 'Cardano ADA',
        is_ada: true,
        decimals: 6,
        quantity: adaAmount,
        usd_value: adaAmount * adaUsd
    };
    if (!portfolioOnly || (adaToken?.id && targetTokenIds.has(adaToken.id))) {
        holdings.push(adaHolding);
    }

    // Pre-fetch USD prices for tokens with tickers (metadata present)
    const tickers = (tokens || []).filter(t => t.ticker && !t.is_ada).map(t => (t.ticker as string).toUpperCase());
    console.log(`[holdings] Fetching Kraken USD prices for tickers: ${JSON.stringify(tickers)}`);
    const usdByTicker = await fetchKrakenUsdPricesForTickers(tickers);
    console.log(`[holdings] Kraken USD price map: ${JSON.stringify(Object.fromEntries(usdByTicker.entries()))}`);

    for (const a of (assets || [])) {
        const key = `${a.policy_id}:${a.asset_name}`;
        const t = tokenByKey.get(key);
        const decimals = t?.decimals ?? 0;
        const qty = parseInt(a.quantity || '0', 10) / Math.pow(10, decimals);
        let usd = 0;
        if (t?.ticker === 'DJED') {
            usd = qty * djedUsd;
        } else if (t && t.ticker) {
            // Only attempt pricing for tokens that have metadata (ticker present)
            const symbol = (t.ticker as string).toUpperCase();
            const usdPrice = usdByTicker.get(symbol) || 0;
            if (usdPrice && isFinite(usdPrice) && usdPrice > 0) {
                usd = qty * usdPrice;
            }
        }
        const row: Holding = {
            token_id: t?.id || null,
            policy_id: a.policy_id,
            asset_name: a.asset_name,
            ticker: t?.ticker || null,
            name: t?.name || null,
            is_ada: false,
            decimals,
            quantity: qty,
            usd_value: usd
        };
        if (!portfolioOnly || (t?.id && targetTokenIds.has(t.id))) {
            holdings.push(row);
        }
    }

    // Upsert fungible tokens that are not in the DB yet, and enrich display name via Koios asset_info
    const missing = (assets || [])
        .filter((a) => a.policy_id && a.asset_name)
        .filter((a) => !tokenByKey.has(`${a.policy_id}:${a.asset_name}`))
        .filter((a) => parseInt(a.quantity || '0', 10) !== 1); // skip NFTs (quantity exactly 1)

    if (missing.length > 0) {
        const infoResp = await koiosApi.post('/asset_info', {
            _asset_list: missing.map(a => [a.policy_id, a.asset_name])
        });
        if (Array.isArray(infoResp.data)) {
            for (const row of infoResp.data) {
                const md = row?.token_registry_metadata ?? null;
                const decimals = typeof md?.decimals === 'number' ? md.decimals : (typeof md?.decimals === 'string' && md.decimals.trim() !== '' ? Number(md.decimals) : 0);
                await supabase.from('tokens').upsert({
                    policy_id: row.policy_id,
                    asset_name: row.asset_name,
                    fingerprint: row.fingerprint ?? null,
                    ticker: md?.ticker ?? null,
                    name: md?.name ?? (row?.asset_name_ascii ?? null),
                    decimals,
                    is_ada: false,
                    metadata: md ? { token_registry_metadata: md } : {}
                }, { onConflict: 'policy_id,asset_name' });
            }
        }
    }

    const total_usd_value = holdings.reduce((s, h) => s + (Number(h.usd_value) || 0), 0);
    return res.status(200).json({ wallet_id: wallet.id, is_using_fallback_rate: isFallback, ada_usd: adaUsd, holdings, total_usd_value });
}


