import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computePortfolioSnapshotHoldings } from '../lib/portfolioHoldings';
import type { SnapshotHolding } from '../types';
import { notifyIfDeviationsExceedThreshold } from '../lib/portfolioDeviation';
import { koiosApi } from '../lib/koios';
import { getAdaUsdCached } from '../lib/pricing';
import { getUsdPricesForTickersCached } from '../lib/tokenPricing';

// (day boundary helpers removed; using snapshot_date instead)

function tokenKey(h: { policy_id: string | null; asset_name: string | null; is_ada?: boolean; quantity?: number }): string | null {
    if (h.is_ada) return null; // ignore ADA for token-set difference checks
    if (!h.policy_id || !h.asset_name) return null;
    const qty = typeof h.quantity === 'number' ? h.quantity : 0;
    if (!qty || qty <= 0) return null;
    return `${h.policy_id}:${h.asset_name}`;
}

function areTokenSetsDifferent(a: SnapshotHolding[], b: SnapshotHolding[]): boolean {
    const setA = new Set<string>();
    const setB = new Set<string>();
    for (const h of a || []) {
        const k = tokenKey(h);
        if (k) setA.add(k);
    }
    for (const h of b || []) {
        const k = tokenKey(h);
        if (k) setB.add(k);
    }
    if (setA.size !== setB.size) return true;
    for (const k of setA) if (!setB.has(k)) return true;
    return false;
}

async function computeHoldingsForWallet(
    supabaseAdmin: SupabaseClient,
    walletId: string,
    addressOrStake: string,
    isStake: boolean,
    pricing: { adaUsd: number; isFallbackAda: boolean; usdByTicker: Map<string, number> }
) {
    return computePortfolioSnapshotHoldings(supabaseAdmin, walletId, addressOrStake, { isStake, pricing });
}

async function main() {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceRoleKey) {
        console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        process.exit(1);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    // Load active wallets
    const { data: wallets, error: wErr } = await supabaseAdmin
        .from('wallets')
        .select('id, name, address, stake_address, is_active, threshold_percent, config')
        .eq('is_active', true);
    if (wErr) {
        console.error('Failed to load wallets:', wErr.message);
        process.exit(1);
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // UTC YYYY-MM-DD

    type WalletRow = { id: string; name: string | null; address: string | null; stake_address: string | null; is_active: boolean; threshold_percent: number | null; config?: Record<string, unknown> | null };
    const walletRows: WalletRow[] = (wallets || []) as WalletRow[];

    // Prefetch ADA price and USD prices for all tickers across all wallets once
    // We need to collect all tickers: load tokens table (using admin client) and collect tickers present
    const { data: tokenRows } = await supabaseAdmin
        .from('tokens')
        .select('ticker, is_ada');
    const allTickers = Array.from(new Set(((tokenRows || [])
        .filter((t: { ticker: string | null; is_ada: boolean }) => t.ticker !== null && !t.is_ada)
        .map((t: { ticker: string | null }) => String(t.ticker).toUpperCase()))));
    const adaInfo = await getAdaUsdCached();
    const usdByTicker = await getUsdPricesForTickersCached(allTickers);
    for (const wallet of walletRows) {
        try {
            console.log(`Processing wallet ${wallet.id}...`);
            // backfill stake address if missing
            if (!wallet.stake_address && wallet.address) {
                try {
                    const info = await koiosApi.post('/address_info', { _addresses: [wallet.address] });
                    const resolved = Array.isArray(info.data) && info.data[0] && info.data[0].stake_address ? String(info.data[0].stake_address) : null;
                    if (resolved) {
                        await supabaseAdmin.from('wallets').update({ stake_address: resolved }).eq('id', wallet.id);
                        wallet.stake_address = resolved;
                    }
                } catch {
                    // ignore
                }
            }
            const addrOrStake = wallet.stake_address || wallet.address || '';
            const isStake = Boolean(wallet.stake_address);
            const { holdings, total_usd_value, is_using_fallback_rate, ada_usd } = await computeHoldingsForWallet(
                supabaseAdmin,
                wallet.id as string,
                addrOrStake,
                isStake,
                { adaUsd: adaInfo.price, isFallbackAda: adaInfo.isFallback, usdByTicker }
            );

            // Notify deviations vs targets if any exceed threshold
            await notifyIfDeviationsExceedThreshold(
                supabaseAdmin,
                { id: wallet.id, name: wallet.name, threshold_percent: wallet.threshold_percent, config: wallet.config },
                holdings,
                total_usd_value
            );

            // Get today's first snapshot if any
            const { data: todays, error: sErr } = await supabaseAdmin
                .from('snapshots')
                .select('id, holdings, taken_at')
                .eq('wallet_id', wallet.id)
                .eq('snapshot_date', todayStr)
                .order('taken_at', { ascending: true })
                .limit(1);
            if (sErr) throw sErr;
            const morning = (Array.isArray(todays) && todays.length > 0
                ? (todays[0] as unknown as { id: string; holdings: SnapshotHolding[]; taken_at: string })
                : undefined);

            if (!morning) {
                console.log(`No snapshot for today. Inserting morning snapshot for wallet ${wallet.id}.`);
                const { error: insErr } = await supabaseAdmin
                    .from('snapshots')
                    .insert([{
                        wallet_id: wallet.id,
                        snapshot_date: todayStr,
                        total_usd_value,
                        is_using_fallback_rate,
                        meta: { ada_usd },
                        holdings
                    }]);
                if (insErr) throw insErr;
                console.log(`Inserted snapshot for wallet ${wallet.id}.`);
            } else {
                const prevHoldings = morning.holdings as SnapshotHolding[];
                const changed = areTokenSetsDifferent(prevHoldings || [], holdings || []);
                if (changed) {
                    console.log(`Token set changed for wallet ${wallet.id}. Updating today's snapshot.`);
                    const { error: updErr } = await supabaseAdmin
                        .from('snapshots')
                        .update({
                            total_usd_value,
                            is_using_fallback_rate,
                            meta: { ada_usd },
                            holdings,
                            taken_at: new Date().toISOString(),
                            snapshot_date: todayStr
                        })
                        .eq('id', morning.id);
                    if (updErr) throw updErr;
                    console.log(`Updated snapshot for wallet ${wallet.id}.`);
                } else {
                    console.log(`No token set change for wallet ${wallet.id}. Skipping update.`);
                }
            }
        } catch (err: unknown) {
            let message: string;
            if (err instanceof Error) {
                message = err.message;
            } else if (err && typeof err === 'object' && 'message' in err) {
                const m = (err as { message?: unknown }).message;
                message = typeof m === 'string' ? m : JSON.stringify(m);
            } else {
                message = String(err);
            }
            console.error(`Error processing wallet ${(wallet && wallet.id) || 'unknown'}:`, message);
        }
    }
}

main().catch((e) => {
    console.error('Fatal error:', e?.message || e);
    process.exit(1);
});


