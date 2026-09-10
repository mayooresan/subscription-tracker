import React from 'react';
import { DollarSign, Calendar, Activity, Clock } from 'lucide-react';

export function MetricsBar({ stats }) {
  const cards = [
    {
      label: 'Monthly Burn Rate',
      value: `$${(stats?.monthlySpend || 0).toFixed(2)}`,
      sub: 'Normalized across all cycles',
      icon: DollarSign,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Annual Cost',
      value: `$${(stats?.annualSpend || 0).toFixed(2)}`,
      sub: 'Projected 12-month total',
      icon: Calendar,
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
    {
      label: 'Active Subscriptions',
      value: `${stats?.activeCount || 0} / ${stats?.totalCount || 0}`,
      sub: 'Currently enabled',
      icon: Activity,
      color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    },
    {
      label: 'Renewing Soon (7 Days)',
      value: stats?.upcomingIn7Days || 0,
      sub: 'Approaching renewals',
      icon: Clock,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-400">{c.label}</span>
              <div className={`p-2 rounded-xl border ${c.color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white tracking-tight">{c.value}</div>
              <p className="text-xs text-slate-500 mt-1">{c.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
