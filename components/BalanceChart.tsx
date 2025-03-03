import React from "react";
import { WalletBalance } from "../types/wallet";

interface Props {
  balance: WalletBalance;
}

const BalanceChart: React.FC<Props> = ({ balance }) => {
  return (
    <div className="border p-4">
      <h2 className="text-xl font-semibold mb-2">Balance Chart</h2>
      <div>
        <p>ADA: {balance.adaPercentage.toFixed(2)}%</p>
        <p>DJED: {balance.djedPercentage.toFixed(2)}%</p>
      </div>
    </div>
  );
};

export default BalanceChart;
