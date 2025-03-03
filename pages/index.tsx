import React from "react";
import { useQuery, useMutation, QueryClient, QueryClientProvider } from "react-query";
import { apiRequest } from "../lib/apiRequest";
import BalanceChart from "../components/BalanceChart";
import BalanceStatus from "../components/BalanceStatus";
import Card from "../components/Card";
import Button from "../components/Button";
import Skeleton from "../components/Skeleton";
import toast from "react-hot-toast";
import { WalletBalance } from "../types/wallet";

// Create a QueryClient instance
const queryClient = new QueryClient();

const Dashboard = () => {
  const sendAlert = useMutation({
    mutationFn: () =>
      apiRequest("/api/wallet/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      }),
    onSuccess: () => {
      toast.success("Discord alert sent successfully");
    },
    onError: (err) => {
      console.error("Failed to send alert:", err);
      toast.error("Failed to send Discord alert. Please try again later.");
    },
  });  

  const { data: balance, isLoading } = useQuery<WalletBalance>("walletBalance", () =>
    apiRequest("/api/wallet/balance", { method: "GET" }), {
    refetchInterval: 600000, // Refresh every 10 minutes
    retry: 1,
    onError: (err) => {
      console.error("Balance fetch error:", err);
      toast.error("Failed to load wallet balance. Please try again later.");
    }
  }
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Error</h2>
          <p>Failed to load wallet balance</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Wallet Monitor</h1>
        <Button onClick={() => sendAlert.mutate()} disabled={sendAlert.isLoading}>
          {sendAlert.isLoading ? "Sending..." : "Send Discord Alert"}
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <BalanceChart balance={balance} />
        <BalanceStatus balance={balance} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">ADA Balance</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Amount:</span>
              <span>{balance.ada.amount.toFixed(2)} ADA</span>
            </div>
            <div className="flex justify-between">
              <span>Value:</span>
              <span>${balance.ada.usdValue.toFixed(2)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">DJED Balance</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Amount:</span>
              <span>{balance.djed.amount.toFixed(2)} DJED</span>
            </div>
            <div className="flex justify-between">
              <span>Value:</span>
              <span>${balance.djed.usdValue.toFixed(2)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const HomePage = () => (
  <QueryClientProvider client={queryClient}>
    <Dashboard />
  </QueryClientProvider>
);

export default HomePage;
