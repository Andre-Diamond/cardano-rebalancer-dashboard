import React from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    LineElement,
    PointElement,
    LinearScale,
    TimeScale,
    Legend,
    Tooltip,
    Filler,
    CategoryScale
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import type { WalletSnapshotRow, SnapshotHolding } from '../types';

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Legend, Tooltip, Filler, CategoryScale);

type Props = {
    snapshots: WalletSnapshotRow[];
};

function buildDatasets(snapshots: WalletSnapshotRow[]) {
    const labels = snapshots.map(s => s.taken_at || (s.snapshot_date + 'T00:00:00Z'));

    const totalDataset = {
        label: 'Total USD',
        data: snapshots.map(s => Number(s.total_usd_value) || 0),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        tension: 0.3,
        fill: true,
        yAxisID: 'y',
    };

    // Aggregate token time series by token_id or policy:asset key
    const tokenKey = (h: SnapshotHolding): string => {
        if (h.is_ada) return 'ADA';
        return `${h.policy_id}:${h.asset_name}`;
    };

    const tokenName = (h: SnapshotHolding): string => {
        if (h.is_ada) return 'ADA';
        return h.ticker || h.name || `${h.policy_id?.slice(0, 6)}...${h.asset_name?.slice(0, 6)}`;
    };

    const seriesMap = new Map<string, { label: string; qtyValues: number[]; usdValues: number[]; color: string }>();

    const palette = [
        '#16a34a', '#ef4444', '#f59e0b', '#06b6d4', '#8b5cf6', '#ec4899', '#22c55e', '#f97316', '#64748b', '#eab308'
    ];

    snapshots.forEach((snap, idx) => {
        const qtyByKey = new Map<string, number>();
        const usdByKey = new Map<string, number>();
        (snap.holdings || []).forEach(h => {
            const key = tokenKey(h);
            qtyByKey.set(key, (qtyByKey.get(key) || 0) + (Number(h.quantity) || 0));
            usdByKey.set(key, (usdByKey.get(key) || 0) + (Number(h.usd_value) || 0));
        });

        const keysThisTick = new Set<string>([...qtyByKey.keys(), ...usdByKey.keys()]);
        const existingKeys = new Set(seriesMap.keys());

        keysThisTick.forEach(key => {
            if (!seriesMap.has(key)) {
                const h = (snap.holdings || []).find(x => tokenKey(x) === key) as SnapshotHolding | undefined;
                const label = h ? tokenName(h) : key;
                seriesMap.set(key, { label, qtyValues: Array(idx).fill(0), usdValues: Array(idx).fill(0), color: palette[seriesMap.size % palette.length] });
            }
            const series = seriesMap.get(key)!;
            series.qtyValues.push(qtyByKey.get(key) || 0);
            series.usdValues.push(usdByKey.get(key) || 0);
            existingKeys.delete(key);
        });

        existingKeys.forEach(key => {
            const series = seriesMap.get(key)!;
            series.qtyValues.push(0);
            series.usdValues.push(0);
        });
    });

    const tokenDatasets = Array.from(seriesMap.values()).flatMap(s => ([
        {
            label: `${s.label} USD`,
            data: s.usdValues,
            borderColor: s.color,
            backgroundColor: s.color + '22',
            tension: 0.3,
            fill: false,
            yAxisID: 'y',
            borderWidth: 1,
            pointRadius: 0,
        },
        {
            label: `${s.label} Qty`,
            data: s.qtyValues,
            borderColor: s.color,
            backgroundColor: s.color + '11',
            tension: 0.3,
            fill: false,
            yAxisID: 'y1',
            borderDash: [4, 3],
            borderWidth: 1,
            pointRadius: 0,
        }
    ]));

    return { labels, totalDataset, tokenDatasets };
}

export default function WalletCharts({ snapshots }: Props) {
    const { labels, totalDataset, tokenDatasets } = React.useMemo(() => buildDatasets(snapshots || []), [snapshots]);

    const data = React.useMemo(() => ({
        labels,
        datasets: [totalDataset, ...tokenDatasets],
    }), [labels, totalDataset, tokenDatasets]);

    const options = React.useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        stacked: false,
        plugins: {
            legend: { position: 'top' as const },
            tooltip: { mode: 'index' as const, intersect: false },
        },
        scales: {
            x: {
                type: 'time' as const,
                time: { unit: 'day' as const },
                grid: { display: false },
            },
            y: {
                type: 'linear' as const,
                position: 'left' as const,
                title: { display: true, text: 'USD' },
            },
            y1: {
                type: 'linear' as const,
                position: 'right' as const,
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Quantity' },
            },
        },
    }), []);

    return (
        <div style={{ height: 220, marginTop: 8 }}>
            <Line data={data} options={options} />
        </div>
    );
}


