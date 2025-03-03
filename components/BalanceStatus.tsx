import React from "react";
import { WalletBalance } from "../types/wallet";

interface Props {
  balance: WalletBalance;
}

const BalanceStatus: React.FC<Props> = ({ balance }) => {
  return (
    <div className="border p-4">
      <h2 className="text-xl font-semibold mb-2">Balance Status</h2>
      {balance.rebalanceAmount ? (
        <p>
          Swap {balance.rebalanceAmount.amount.toFixed(2)} {balance.rebalanceAmount.from}
          (≈${balance.rebalanceAmount.usdValue.toFixed(2)}) to {balance.rebalanceAmount.from === 'ADA' ? 'DJED' : 'ADA'}
        </p>
      ) : (
        <p>Balance is within threshold</p>
      )}
    </div>
  );
};

export default BalanceStatus;
