import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { computePortfolioSnapshotHoldings } from "../../../../lib/portfolioHoldings";

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
        .select('id, address')
        .eq('id', walletId)
        .single();
    if (wErr || !wallet) return res.status(404).json({ error: 'Wallet not found' });

    const { holdings, total_usd_value, is_using_fallback_rate, ada_usd } = await computePortfolioSnapshotHoldings(supabase, wallet.id as string, wallet.address as string);
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


