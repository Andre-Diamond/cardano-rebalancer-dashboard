import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { calculateRebalanceSwaps, formatRebalanceMessage } from "../../../../lib/rebalance";
import type { Holding, PortfolioRow } from "../../../../types";
import { koiosApi } from "../../../../lib/koios";
import { getAdaUsdCached } from "../../../../lib/pricing";
import { getUsdPricesForTickersCached } from "../../../../lib/tokenPricing";
import { sendDiscordMessage } from "../../../../lib/discord";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { walletId } = req.query as { walletId: string };
    const sendFlag = (req.method === 'POST') && ((req.body && req.body.send === true) || String(req.query.send || 'false') === 'true');

    try {
        // Load wallet config/thresholds
        const { data: walletRow, error: wErr } = await supabase
            .from('wallets')
            .select('id, name, address, stake_address, threshold_percent, config')
            .eq('id', walletId)
            .single();
        if (wErr || !walletRow) return res.status(404).json({ error: 'Wallet not found' });

        const walletName: string = (walletRow as { name?: string | null }).name || walletId;
        const globalThreshold = typeof (walletRow as { threshold_percent?: number | null }).threshold_percent === 'number'
            ? Number((walletRow as { threshold_percent?: number | null }).threshold_percent)
            : 10;
        const cfg = (walletRow as { config?: Record<string, unknown> | null }).config || {};
        const thresholdsByTokenId = (cfg && typeof cfg === 'object' && (cfg as Record<string, unknown>).thresholds_by_token_id && typeof (cfg as Record<string, unknown>).thresholds_by_token_id === 'object')
            ? ((cfg as Record<string, unknown>).thresholds_by_token_id as Record<string, number>)
            : {};

        // Load portfolio targets with token labels
        const { data: targetsRows, error: tErr } = await supabase
            .from('wallet_portfolio_targets')
            .select('wallet_id, token_id, target_weight_percent, tokens ( ticker, name, is_ada )')
            .eq('wallet_id', walletId);
        if (tErr) return res.status(500).json({ error: tErr.message });
        const targets: PortfolioRow[] = (targetsRows || []).map((r: any) => ({ wallet_id: r.wallet_id, token_id: r.token_id, target_weight_percent: r.target_weight_percent }));
        const tokenLabelsById: Record<string, string> = {};
        const tokenMetaById: Record<string, { ticker?: string | null; name?: string | null }> = {};
        for (const r of (targetsRows || [])) {
            const label = (r.tokens?.ticker || r.tokens?.name || (r.tokens?.is_ada ? 'ADA' : 'Token')) as string;
            tokenLabelsById[r.token_id] = label;
            tokenMetaById[r.token_id] = { ticker: r.tokens?.ticker || (r.tokens?.is_ada ? 'ADA' : null), name: r.tokens?.name || null };
        }

        // Build holdings restricted to portfolio tokens (same logic as holdings endpoint with portfolioOnly=true)
        let stakeAddr: string | null = (walletRow as { stake_address?: string | null }).stake_address || null;
        const baseAddr: string | null = (walletRow as { address?: string | null }).address || null;
        if (!stakeAddr && baseAddr) {
            try {
                const info = await koiosApi.post('/address_info', { _addresses: [baseAddr] });
                const resolved = Array.isArray(info.data) && info.data[0] && info.data[0].stake_address ? String(info.data[0].stake_address) : null;
                if (resolved) {
                    await supabase.from('wallets').update({ stake_address: resolved }).eq('id', (walletRow as { id: string }).id);
                    stakeAddr = resolved;
                }
            } catch {
                // ignore resolution errors
            }
        }
        if (!stakeAddr) return res.status(400).json({ error: 'Stake address unavailable for wallet' });

        const { price: adaUsd } = await getAdaUsdCached();
        const djedUsd = 1;

        // ADA balance
        const accResp = await koiosApi.post('/account_info', { _stake_addresses: [stakeAddr] });
        const total = accResp?.data?.[0]?.total_balance ? String(accResp.data[0].total_balance) : '0';
        const adaAmount = parseInt(total, 10) / 1_000_000;

        // Token assets
        const assetResp = await koiosApi.post('/account_assets', { _stake_addresses: [stakeAddr] });
        type AccountAsset = { policy_id: string; asset_name: string; quantity: string };
        const assets: AccountAsset[] = Array.isArray(assetResp.data) ? (assetResp.data as AccountAsset[]).map((r: AccountAsset) => ({ policy_id: r.policy_id, asset_name: r.asset_name, quantity: r.quantity })) : [];

        // Load tokens registry
        const { data: tokens } = await supabase.from('tokens').select('id, policy_id, asset_name, is_ada, ticker, name, decimals');
        const tokenByKey = new Map<string, { id: string; is_ada: boolean; ticker: string | null; name: string | null; decimals: number }>();
        (tokens || []).forEach((t: any) => tokenByKey.set(`${t.policy_id}:${t.asset_name}`, { id: t.id, is_ada: t.is_ada, ticker: t.ticker, name: t.name, decimals: t.decimals }));
        const adaToken = (tokens || []).find((t: any) => t.is_ada);

        const targetTokenIds = new Set<string>((targets || []).map(t => t.token_id));

        const holdings: Holding[] = [];
        if (adaToken && targetTokenIds.has(adaToken.id)) {
            holdings.push({
                token_id: adaToken.id,
                policy_id: null,
                asset_name: null,
                ticker: adaToken.ticker || 'ADA',
                name: adaToken.name || 'Cardano ADA',
                is_ada: true,
                decimals: 6,
                quantity: adaAmount,
                usd_value: adaAmount * adaUsd
            });
        }

        // Pre-fetch USD prices for tokens with tickers
        const tickers = (tokens || []).filter((t: any) => t.ticker && !t.is_ada).map((t: any) => String(t.ticker).toUpperCase());
        const usdByTicker = await getUsdPricesForTickersCached(tickers);

        for (const a of (assets || [])) {
            const key = `${a.policy_id}:${a.asset_name}`;
            const t = tokenByKey.get(key);
            const decimals = t?.decimals ?? 0;
            const qty = parseInt(a.quantity || '0', 10) / Math.pow(10, decimals);
            let usd = 0;
            if (t?.ticker === 'DJED') {
                usd = qty * djedUsd;
            } else if (t && t.ticker) {
                const symbol = (t.ticker as string).toUpperCase();
                const usdPrice = usdByTicker.get(symbol) || 0;
                if (usdPrice && isFinite(usdPrice) && usdPrice > 0) usd = qty * usdPrice;
            }
            const row: Holding = {
                token_id: t?.id || null,
                policy_id: a.policy_id,
                asset_name: a.asset_name,
                ticker: t?.ticker || null,
                name: t?.name || null,
                is_ada: Boolean(t?.is_ada),
                decimals,
                quantity: qty,
                usd_value: usd
            };
            if (t?.id && targetTokenIds.has(t.id)) holdings.push(row);
        }

        const total_usd_value = holdings.reduce((s, h) => s + (Number(h.usd_value) || 0), 0);

        // Compute rebalance plan
        const plan = calculateRebalanceSwaps(
            targets,
            holdings,
            total_usd_value,
            { globalPercent: globalThreshold, byTokenId: thresholdsByTokenId },
            tokenMetaById
        );
        const message = formatRebalanceMessage(walletName, plan, tokenLabelsById);

        if (sendFlag) {
            await sendDiscordMessage(message);
        }

        return res.status(200).json({ ok: true, plan, message, sent: Boolean(sendFlag) });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(500).json({ error: msg });
    }
}


