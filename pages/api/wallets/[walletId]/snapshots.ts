import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

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
    const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.max(1, Math.min(1000, Number(limitParam || 365))) || 365;

    const { data, error } = await supabase
        .from('snapshots')
        .select('snapshot_date, taken_at, total_usd_value, holdings')
        .eq('wallet_id', walletId)
        .order('snapshot_date', { ascending: true })
        .limit(limit);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(Array.isArray(data) ? data : []);
}


