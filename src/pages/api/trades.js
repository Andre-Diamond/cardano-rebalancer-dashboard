// pages/api/trades.js
import { getTradeData } from '../../lib/sheets';

export default async function handler(req, res) {
  try {
    const trades = await getTradeData();
    res.status(200).json({ trades });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
