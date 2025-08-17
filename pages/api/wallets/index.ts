import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Wallet } from "../../../types";
import { koiosApi } from "../../../lib/koios";

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
        const { name, address, stake_address, is_active, threshold_percent, config } = req.body || {};
        if (!name || (!address && !stake_address)) return res.status(400).json({ error: 'name and address or stake_address are required' });

        // Resolve stake address if only a payment/base address was provided
        let resolvedStake: string | null = null;
        let resolvedAddress: string | null = address || null;
        try {
            if (typeof stake_address === 'string' && stake_address.startsWith('stake')) {
                resolvedStake = stake_address;
            } else if (typeof address === 'string') {
                if (address.startsWith('stake')) {
                    resolvedStake = address;
                    resolvedAddress = null;
                } else {
                    const info = await koiosApi.post('/address_info', { _addresses: [address] });
                    const stakeAddr = Array.isArray(info.data) && info.data[0] && info.data[0].stake_address ? String(info.data[0].stake_address) : null;
                    resolvedStake = stakeAddr;
                }
            }
        } catch {
            // If Koios lookup fails, proceed without stake (can be filled later)
        }

        const { data, error } = await supabase
            .from('wallets')
            .insert([{
                name,
                address: resolvedAddress,
                stake_address: resolvedStake,
                is_active: typeof is_active === 'boolean' ? is_active : true,
                threshold_percent: typeof threshold_percent === 'number' ? threshold_percent : 10,
                config: config ?? {}
            }])
            .select('*')
            .single();

        if (error) return res.status(500).json({ error: error.message });
        return res.status(201).json(data as Wallet);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}


