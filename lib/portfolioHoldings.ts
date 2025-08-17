import { koiosApi } from './koios';
import { getAdaUsdCached } from './pricing';
import { getUsdPricesForTickersCached } from './tokenPricing';
import type { SnapshotHolding } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function computePortfolioSnapshotHoldings(
    supabase: SupabaseClient,
    walletId: string,
    addressOrStake: string,
    options?: { isStake?: boolean; pricing?: { adaUsd: number; isFallbackAda: boolean; usdByTicker: Map<string, number> } }
) {
    const useCachedAda = options?.pricing?.adaUsd && typeof options.pricing.adaUsd === 'number';
    const adaInfo = useCachedAda
        ? { price: options!.pricing!.adaUsd, isFallback: Boolean(options!.pricing!.isFallbackAda) }
        : await getAdaUsdCached();
    const adaUsd = adaInfo.price;
    const isFallback = adaInfo.isFallback;
    const djedUsd = 1;

    let stakeAddress = addressOrStake;
    if (!options?.isStake) {
        // Resolve stake address from base address
        try {
            const info = await koiosApi.post('/address_info', { _addresses: [addressOrStake] });
            const resolved = Array.isArray(info.data) && info.data[0] && info.data[0].stake_address ? String(info.data[0].stake_address) : null;
            if (!resolved) throw new Error('Stake address not found for base address');
            stakeAddress = resolved;
        } catch {
            throw new Error('Stake address unavailable for wallet');
        }
    }

    const accResp = await koiosApi.post('/account_info', { _stake_addresses: [stakeAddress] });
    const total = accResp?.data?.[0]?.total_balance ? String(accResp.data[0].total_balance) : '0';
    const adaAmount = parseInt(total, 10) / 1_000_000;

    const assetResp = await koiosApi.post('/account_assets', { _stake_addresses: [stakeAddress] });
    type AccountAsset = { policy_id: string; asset_name: string; quantity: string };
    const assets: Array<{ policy_id: string; asset_name: string; quantity: string }> = Array.isArray(assetResp.data)
        ? (assetResp.data as AccountAsset[]).map((r: AccountAsset) => ({ policy_id: r.policy_id, asset_name: r.asset_name, quantity: r.quantity }))
        : [];

    const sel = await supabase
        .from('tokens')
        .select('id, policy_id, asset_name, is_ada, ticker, name, decimals');
    const tokens = (sel.data ?? []) as Array<{ id: string; policy_id: string | null; asset_name: string | null; is_ada: boolean; ticker: string | null; name: string | null; decimals: number }>;

    const tokenByKey = new Map<string, { id: string; policy_id: string | null; asset_name: string | null; is_ada: boolean; ticker: string | null; name: string | null; decimals: number }>();
    (tokens || []).forEach((t) => tokenByKey.set(`${t.policy_id}:${t.asset_name}`, t));
    const adaToken = (tokens || []).find((t) => t.is_ada);

    // Portfolio targets for this wallet
    const { data: targetsRows } = await supabase
        .from('wallet_portfolio_targets')
        .select('token_id')
        .eq('wallet_id', walletId);
    const targetTokenIds = new Set<string>((Array.isArray(targetsRows) ? targetsRows : []).map((r: { token_id: string }) => r.token_id));

    const holdings: SnapshotHolding[] = [];
    if (adaToken && targetTokenIds.has(adaToken.id)) {
        holdings.push({
            token_id: adaToken.id,
            policy_id: null,
            asset_name: null,
            ticker: adaToken.ticker || 'ADA',
            quantity: adaAmount,
            usd_value: adaAmount * adaUsd
        });
    }

    const tickers = (tokens || [])
        .filter((t) => t.ticker !== null && !t.is_ada)
        .map((t) => String(t.ticker).toUpperCase());
    const usdByTicker = options?.pricing?.usdByTicker
        ? options.pricing.usdByTicker
        : await getUsdPricesForTickersCached(tickers);

    for (const a of (assets || [])) {
        const key = `${a.policy_id}:${a.asset_name}`;
        const t = tokenByKey.get(key);
        const decimals = t?.decimals ?? 0;
        const qty = parseInt(a.quantity || '0', 10) / Math.pow(10, decimals);
        let usd = 0;
        if (t?.ticker === 'DJED') {
            usd = qty * djedUsd;
        } else if (t && t.ticker) {
            const symbol = String(t.ticker).toUpperCase();
            const usdPrice = usdByTicker.get(symbol) || 0;
            if (usdPrice && isFinite(usdPrice) && usdPrice > 0) {
                usd = qty * usdPrice;
            }
        }
        if (t && t.id && targetTokenIds.has(t.id)) {
            holdings.push({
                token_id: t.id,
                policy_id: a.policy_id,
                asset_name: a.asset_name,
                ticker: t.ticker || null,
                quantity: qty,
                usd_value: usd
            });
        }
    }

    const total_usd_value = holdings.reduce((s, h) => s + (Number(h.usd_value) || 0), 0);
    return { holdings, total_usd_value, is_using_fallback_rate: isFallback, ada_usd: adaUsd } as const;
}


