// ../pages/api/wallet/balance.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { getWalletBalance } from "../../../lib/wallet";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    // Check if required environment variables are set
    if (!process.env.KOIOS_API_KEY) {
      console.error("KOIOS_API_KEY is not configured");
      return res.status(500).json({ error: "API configuration error" });
    }

    if (!process.env.WALLET_ADDRESS) {
      console.error("WALLET_ADDRESS is not configured");
      return res.status(500).json({ error: "API configuration error" });
    }

    console.log("Fetching wallet balance...");
    const balance = await getWalletBalance();
    console.log("Successfully fetched wallet balance");
    res.status(200).json(balance);
  } catch (error) {
    console.error("Error fetching balance:", error);
    // Send more detailed error information
    res.status(500).json({
      error: "Failed to fetch wallet balance",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

