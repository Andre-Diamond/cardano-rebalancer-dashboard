import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Wallet } from "../../../types";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'GET') {
        const { data, error } = await supabase
            .from('wallets')
            .select('*')
            .order('created_at', { ascending: true });
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data as Wallet[]);
    }

    if (req.method === 'POST') {
        const { name, address, is_active, threshold_percent, config } = req.body || {};
        if (!name || !address) return res.status(400).json({ error: 'name and address are required' });

        const { data, error } = await supabase
            .from('wallets')
            .insert([{
                name,
                address,
                is_active: typeof is_active === 'boolean' ? is_active : true,
                threshold_percent: typeof threshold_percent === 'number' ? threshold_percent : 10,
                config: config ?? {}
            }])
            .select('*')
            .single();

        if (error) return res.status(500).json({ error: error.message });
        // default 50/50 targets are created by DB trigger
        return res.status(201).json(data as Wallet);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}


