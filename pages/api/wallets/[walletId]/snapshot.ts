import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { computePortfolioSnapshotHoldings } from "../../../../lib/portfolioHoldings";
import { koiosApi } from "../../../../lib/koios";
import { notifyIfDeviationsExceedThreshold } from "../../../../lib/portfolioDeviation";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { walletId } = req.query as { walletId: string };

    const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id, name, address, stake_address, threshold_percent, config')
        .eq('id', walletId)
        .single();
    if (wErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    // Resolve and persist stake address if missing
    let stakeAddr: string | null = (wallet as { stake_address?: string | null }).stake_address || null;
    const baseAddr: string | null = (wallet as { address?: string | null }).address || null;
    if (!stakeAddr && baseAddr) {
        try {
            const info = await koiosApi.post('/address_info', { _addresses: [baseAddr] });
            const resolved = Array.isArray(info.data) && info.data[0] && info.data[0].stake_address ? String(info.data[0].stake_address) : null;
            if (resolved) {
                await supabase.from('wallets').update({ stake_address: resolved }).eq('id', (wallet as { id: string }).id);
                stakeAddr = resolved;
            }
        } catch {
            // ignore
        }
    }

    if (!stakeAddr) return res.status(400).json({ error: 'Stake address unavailable for wallet' });
    const { holdings, total_usd_value, is_using_fallback_rate, ada_usd } = await computePortfolioSnapshotHoldings(
        supabase,
        wallet.id as string,
        stakeAddr,
        { isStake: true }
    );

    // Notify deviations vs targets if any exceed threshold
    const walletInfo: { id: string; name: string | null; threshold_percent: number | null; config?: Record<string, unknown> | null } = {
        id: wallet.id as string,
        name: (wallet as { name?: string | null }).name ?? null,
        threshold_percent: (wallet as { threshold_percent?: number | null }).threshold_percent ?? null,
        config: (wallet as { config?: Record<string, unknown> | null }).config ?? null
    };
    await notifyIfDeviationsExceedThreshold(supabase, walletInfo, holdings, total_usd_value);
    const totalUsdValue = total_usd_value;

    // Replace today's snapshot if one exists; else insert new
    const todayStr = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

    const { data: todays, error: selErr } = await supabase
        .from('snapshots')
        .select('id, taken_at')
        .eq('wallet_id', wallet.id)
        .eq('snapshot_date', todayStr)
        .order('taken_at', { ascending: true })
        .limit(1);
    if (selErr) return res.status(500).json({ error: selErr.message });

    const existing = Array.isArray(todays) && todays.length > 0 ? todays[0] : null;

    if (!existing) {
        const { data: inserted, error } = await supabase
            .from('snapshots')
            .insert([{
                wallet_id: wallet.id,
                snapshot_date: todayStr,
                total_usd_value: totalUsdValue,
                is_using_fallback_rate,
                meta: { ada_usd },
                holdings
            }])
            .select('*')
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(inserted);
    } else {
        const { data: updated, error: updErr } = await supabase
            .from('snapshots')
            .update({
                total_usd_value: totalUsdValue,
                is_using_fallback_rate,
                meta: { ada_usd },
                holdings,
                taken_at: new Date().toISOString(),
                snapshot_date: todayStr
            })
            .eq('id', existing.id)
            .select('*')
            .single();
        if (updErr) return res.status(500).json({ error: updErr.message });
        return res.status(200).json(updated);
    }
}


