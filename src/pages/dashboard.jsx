// pages/dashboard.js
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrades() {
      const res = await fetch('/api/trades');
      const data = await res.json();
      setTrades(data.trades);
      setLoading(false);
    }
    fetchTrades();
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>Trade Dashboard</h1>
      <table border="1">
        <thead>
          <tr>
            {trades[0] &&
              trades[0].map((col, idx) => <th key={idx}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {trades.slice(1).map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, cidx) => (
                <td key={cidx}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
