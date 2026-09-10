import React from 'react';
import { Calendar, ExternalLink, Edit2, Trash2, Power } from 'lucide-react';

function getDaysUntil(dateStr) {
  if (!dateStr) return 0;
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
  const targetUtc = Date.UTC(year, month - 1, day);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

export function SubscriptionCard({ sub, onEdit, onDelete, onToggle }) {
  const daysUntil = getDaysUntil(sub.next_renewal_date);
  const isOverdue = daysUntil < 0;
  const isImminent = daysUntil <= 1 && daysUntil >= 0;
  const isSoon = daysUntil > 1 && daysUntil <= 3;

  return (
    <div className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
      sub.is_active ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-60'
    }`}>
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 mb-1.5">
              {sub.category || 'General'}
            </span>
            <h3 className="font-bold text-lg text-white leading-snug">{sub.name}</h3>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white">${Number(sub.price).toFixed(2)}</div>
            <div className="text-xs text-slate-400 capitalize">{sub.billing_cycle}</div>
          </div>
        </div>

        {sub.notes && (
          <p className="text-xs text-slate-400 mb-4 line-clamp-2">{sub.notes}</p>
        )}
      </div>

      <div className="pt-4 border-t border-slate-800/80 mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-300">{sub.next_renewal_date}</span>
          {(sub.is_active === 1 || sub.is_active === true) && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isOverdue
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : isImminent
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                : isSoon
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-500'
            }`}>
              {daysUntil < 0
                ? 'Overdue'
                : daysUntil === 0
                ? 'Today'
                : daysUntil === 1
                ? 'Tomorrow (24h)'
                : `in ${daysUntil}d`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {sub.url && (
            <a
              href={sub.url}
              target="_blank"
              rel="noreferrer"
              title="Visit site"
              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => onToggle(sub)}
            title={sub.is_active ? 'Pause subscription' : 'Activate subscription'}
            className={`p-1.5 rounded-lg transition-colors ${
              sub.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-800'
            }`}
          >
            <Power className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(sub)}
            title="Edit"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(sub)}
            title="Delete"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
