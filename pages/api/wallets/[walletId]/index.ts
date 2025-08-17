import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { walletId } = req.query as { walletId: string };

    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('wallets')
            .select('*')
            .eq('id', walletId)
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
        const { threshold_percent, config, address, stake_address } = req.body || {} as {
            threshold_percent?: number; config?: Record<string, unknown>;
            address?: string | null; stake_address?: string | null
        };

        const update: Record<string, unknown> = {};
        if (typeof threshold_percent === 'number' && isFinite(threshold_percent)) {
            update.threshold_percent = threshold_percent;
        }
        if (typeof address === 'string' || address === null) update.address = address;
        if (typeof stake_address === 'string' || stake_address === null) update.stake_address = stake_address;

        if (config && typeof config === 'object') {
            // Merge with existing config to avoid overwriting unrelated keys
            const { data: existing, error: selErr } = await supabase
                .from('wallets')
                .select('config')
                .eq('id', walletId)
                .single();
            if (selErr) return res.status(500).json({ error: selErr.message });
            const prevCfg = (existing && (existing as { config?: Record<string, unknown> | null }).config) || {};
            const nextCfg: Record<string, unknown> = { ...(prevCfg || {}) };
            // Shallow merge
            Object.assign(nextCfg, config);
            // Deep-merge thresholds_by_token_id specifically
            const prevT = (prevCfg && typeof prevCfg === 'object' && (prevCfg as Record<string, unknown>).thresholds_by_token_id && typeof (prevCfg as Record<string, unknown>).thresholds_by_token_id === 'object')
                ? ((prevCfg as Record<string, unknown>).thresholds_by_token_id as Record<string, number>)
                : undefined;
            const newT = (config && typeof config === 'object' && (config as Record<string, unknown>).thresholds_by_token_id && typeof (config as Record<string, unknown>).thresholds_by_token_id === 'object')
                ? ((config as Record<string, unknown>).thresholds_by_token_id as Record<string, number>)
                : undefined;
            if (prevT || newT) {
                nextCfg.thresholds_by_token_id = { ...(prevT || {}), ...(newT || {}) } as Record<string, number>;
            }
            update.config = nextCfg;
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const { data, error } = await supabase
            .from('wallets')
            .update(update)
            .eq('id', walletId)
            .select('*')
            .single();
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}



