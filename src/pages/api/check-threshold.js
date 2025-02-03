// pages/api/check-threshold.js
import { checkThresholdAndNotify } from '../../lib/monitor';

export default async function handler(req, res) {
  const result = await checkThresholdAndNotify();
  res.status(200).json(result);
}
