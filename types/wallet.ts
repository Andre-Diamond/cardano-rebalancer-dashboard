export interface BalanceDetail {
  amount: number;
  usdValue: number;
}

export interface RebalanceAmount {
  from: "ADA" | "DJED";
  amount: number;
  usdValue: number;
}

export interface WalletBalance {
  ada: BalanceDetail;
  djed: BalanceDetail;
  totalUsdValue: number;
  adaPercentage: number;
  djedPercentage: number;
  threshold: number;
  rebalanceAmount?: RebalanceAmount;
}
