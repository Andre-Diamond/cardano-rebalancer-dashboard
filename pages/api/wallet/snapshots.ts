// pages/api/wallet/snapshots.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_PUBLIC_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { data, error } = await supabase
    .from('wallet_snapshots')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    res.status(500).json({ error: "Failed to fetch snapshots" });
  } else {
    res.status(200).json(data);
  }
}
