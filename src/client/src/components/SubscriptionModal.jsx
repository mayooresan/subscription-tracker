import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function SubscriptionModal({ isOpen, onClose, onSave, editingSub }) {
  const [form, setForm] = useState({
    name: '',
    price: '',
    billing_cycle: 'monthly',
    next_renewal_date: '',
    category: 'General',
    url: '',
    notes: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingSub) {
      setForm({
        name: editingSub.name || '',
        price: editingSub.price || '',
        billing_cycle: editingSub.billing_cycle || 'monthly',
        next_renewal_date: editingSub.next_renewal_date || '',
        category: editingSub.category || 'General',
        url: editingSub.url || '',
        notes: editingSub.notes || '',
      });
    } else {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      setForm({
        name: '',
        price: '',
        billing_cycle: 'monthly',
        next_renewal_date: tomorrow,
        category: 'General',
        url: '',
        notes: '',
      });
    }
    setError('');
  }, [editingSub, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Name is required');
    if (!form.price || Number(form.price) < 0) return setError('Valid price is required');
    if (!form.next_renewal_date) return setError('Renewal date is required');

    try {
      await onSave({
        ...form,
        price: Number(form.price),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <h2 className="text-xl font-bold text-white">{editingSub ? 'Edit Subscription' : 'Add New Subscription'}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Service Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Netflix, Spotify, GitHub"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Cost ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="15.99"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Billing Cycle</label>
              <select
                value={form.billing_cycle}
                onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Next Renewal Date *</label>
              <input
                type="date"
                required
                value={form.next_renewal_date}
                onChange={(e) => setForm({ ...form, next_renewal_date: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Category</label>
              <input
                type="text"
                placeholder="Streaming, SaaS, Utilities..."
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Website / Account URL</label>
            <input
              type="url"
              placeholder="https://..."
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Notes</label>
            <textarea
              rows="2"
              placeholder="Credit card used, plan details..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/20"
            >
              {editingSub ? 'Save Changes' : 'Add Subscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
