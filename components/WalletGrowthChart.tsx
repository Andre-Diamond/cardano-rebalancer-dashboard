// components/WalletGrowthChart.tsx

import React from "react";
import { useQuery } from "react-query";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const WalletGrowthChart: React.FC = () => {
  const { data, isLoading, error } = useQuery("walletSnapshots", async () => {
    const res = await fetch("/api/wallet/snapshots");
    if (!res.ok) throw new Error("Network error");
    return res.json();
  });

  // Detect dark mode state
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
      setIsDarkMode(darkModeQuery.matches);
      const listener = (e: MediaQueryListEvent) => {
        setIsDarkMode(e.matches);
      };
      darkModeQuery.addEventListener("change", listener);
      return () => darkModeQuery.removeEventListener("change", listener);
    }
  }, []);

  if (isLoading) return <div>Loading chart...</div>;
  if (error) return <div>Error loading chart</div>;

  // Transform snapshots into chart labels and data points
  interface Snapshot {
    created_at: string;
    total_usd_value: number;
    ada_amount: number;
  }

  const labels = data.map((snapshot: Snapshot) =>
    new Date(snapshot.created_at).toLocaleDateString()
  );
  const totalUsdValues = data.map((snapshot: Snapshot) => snapshot.total_usd_value);
  const adaAmounts = data.map((snapshot: Snapshot) => snapshot.ada_amount);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Wallet Total USD Value",
        data: totalUsdValues,
        fill: false,
        borderColor: isDarkMode ? "rgba(0, 150, 136, 1)" : "rgba(75, 192, 192, 1)",
        tension: 0.1,
        yAxisID: "y",
      },
      {
        label: "ADA Amount",
        data: adaAmounts,
        fill: false,
        borderColor: isDarkMode ? "rgba(255, 99, 132, 1)" : "rgba(255, 99, 132, 1)",
        tension: 0.1,
        yAxisID: "y1",
      },
    ],
  };

  const chartOptions = {
    plugins: {
      legend: {
        labels: {
          color: isDarkMode ? "#fff" : "#000",
        },
      },
      title: {
        display: true,
        text: "Wallet Growth Over Time",
        color: isDarkMode ? "#fff" : "#000",
      },
    },
    scales: {
      x: {
        ticks: {
          color: isDarkMode ? "#fff" : "#000",
        },
        grid: {
          color: isDarkMode ? "rgba(255,255,255,0.2)" : "#ccc",
        },
      },
      y: {
        type: "linear" as const,
        position: "left" as const,
        ticks: {
          color: isDarkMode ? "#fff" : "#000",
        },
        grid: {
          color: isDarkMode ? "rgba(255,255,255,0.2)" : "#ccc",
        },
        title: {
          display: true,
          text: "Total USD Value",
          color: isDarkMode ? "#fff" : "#000",
        },
      },
      y1: {
        type: "linear" as const,
        position: "right" as const,
        ticks: {
          color: isDarkMode ? "#fff" : "#000",
        },
        grid: {
          drawOnChartArea: false, // prevent grid lines from overlapping
        },
        title: {
          display: true,
          text: "ADA Amount",
          color: isDarkMode ? "#fff" : "#000",
        },
      },
    },
  };

  return (
    <div
      style={{
        padding: "1rem",
        backgroundColor: isDarkMode ? "#1f1f1f" : "#fff",
        borderRadius: "4px",
      }}
    >
      <Line data={chartData} options={chartOptions} />
    </div>
  );
};

export default WalletGrowthChart;
