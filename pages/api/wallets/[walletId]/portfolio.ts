import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import type { TargetRow } from "../../../../types";

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
            .from('wallet_portfolio_targets')
            .select('wallet_id, token_id, target_weight_percent, tokens ( policy_id, asset_name, ticker, name, is_ada )')
            .eq('wallet_id', walletId)
            .order('token_id', { ascending: true });

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
        const { targets } = req.body || {} as { targets?: TargetRow[] };
        if (!Array.isArray(targets) || targets.length === 0) {
            return res.status(400).json({ error: 'targets array is required' });
        }

        // Replace existing targets for this wallet
        const { error: delErr } = await supabase
            .from('wallet_portfolio_targets')
            .delete()
            .eq('wallet_id', walletId);
        if (delErr) return res.status(500).json({ error: delErr.message });

        const rows = targets.map((t: TargetRow) => ({
            wallet_id: walletId,
            token_id: t.token_id,
            target_weight_percent: t.target_weight_percent
        }));

        const { data, error } = await supabase
            .from('wallet_portfolio_targets')
            .insert(rows)
            .select('*');

        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}


