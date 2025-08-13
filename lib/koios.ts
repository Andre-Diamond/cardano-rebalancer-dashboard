import axios from "axios";
import type { KoiosAsset, KoiosAssetInfoResponse } from "../types";

export const koiosApi = axios.create({
    baseURL: 'https://api.koios.rest/api/v1',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KOIOS_API_KEY}`
    }
});
// Re-export types for convenience where existing imports reference from lib path
export type { KoiosAsset, KoiosAssetInfoResponse } from "../types";


