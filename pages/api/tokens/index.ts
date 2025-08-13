import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { data, error } = await supabase
        .from('tokens')
        .select('id, policy_id, asset_name, ticker, name, is_ada, decimals')
        .order('is_ada', { ascending: false })
        .order('ticker', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
}


