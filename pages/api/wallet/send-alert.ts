// pages/api/wallet/send-alert.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getWalletBalance, sendDiscordNotification } from "../../../lib/wallet";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure that the request body is parsed as JSON
    // and normalize the force flag (it could be a boolean or a string "true")
    const force = req.body && (req.body.force === true || req.body.force === "true");
    console.log("Force flag:", force);
    
    const balance = await getWalletBalance(process.env.WALLET_ADDRESS || "", force);
    console.log("Balance object:", balance);
    await sendDiscordNotification(process.env.DISCORD_WEBHOOK || "", balance);
    res.status(200).json({ message: "Discord alert sent successfully" });
  } catch (error) {
    console.error("Error sending Discord alert:", error);
    res.status(500).json({ error: "Failed to send Discord alert" });
  }
}
