// ../pages/api/wallet/balance.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { getWalletBalance } from "../../../lib/wallet";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const balance = await getWalletBalance();
    res.status(200).json(balance);
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ error: "Failed to fetch wallet balance" });
  }
}
