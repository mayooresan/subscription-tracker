import React, { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from './api.js';
import { Navbar } from './components/Navbar.jsx';
import { LoginView } from './components/LoginView.jsx';
import { MetricsBar } from './components/MetricsBar.jsx';
import { SubscriptionCard } from './components/SubscriptionCard.jsx';
import { SubscriptionModal } from './components/SubscriptionModal.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';

export function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('next_renewal');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState(null);

  async function loadCategories() {
    try {
      const allSubs = await api.getSubscriptions();
      const cats = Array.from(new Set(allSubs.map((s) => s.category).filter(Boolean))).sort();
      setAllCategories(cats);
    } catch (err) {
      console.error('Failed loading categories:', err);
    }
  }

  async function loadData() {
    try {
      const [subs, st] = await Promise.all([
        api.getSubscriptions({ search, category: categoryFilter, sort: sortOrder }),
        api.getStats(),
      ]);
      setSubscriptions(subs);
      setStats(st);
      if (!categoryFilter && !search) {
        const cats = Array.from(new Set(subs.map((s) => s.category).filter(Boolean))).sort();
        setAllCategories(cats);
      }
    } catch (err) {
      console.error('Failed loading subscriptions:', err);
    }
  }

  useEffect(() => {
    api.checkAuth()
      .then((data) => {
        setAuthenticated(data.authenticated);
      })
      .catch(() => setAuthenticated(false));

    function handleUnauthorized() {
      setAuthenticated(false);
    }
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadData();
    }
  }, [search, categoryFilter, sortOrder, authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadCategories();
    }
  }, [authenticated]);

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Loading SubTrack...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginView
        onLoginSuccess={() => {
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={async () => {
          await api.logout();
          setAuthenticated(false);
        }}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        <MetricsBar stats={stats} />

        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-6">
          <div className="flex flex-1 gap-2 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search subscriptions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            {allCategories.length > 0 && (
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Categories</option>
                {allCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="next_renewal">Sort: Next Renewal</option>
              <option value="price_desc">Sort: Highest Cost</option>
              <option value="price_asc">Sort: Lowest Cost</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>
          </div>

          <button
            onClick={() => {
              setEditingSub(null);
              setIsSubModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Subscription</span>
          </button>
        </div>

        {subscriptions.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-12 text-center">
            <h3 className="font-semibold text-lg text-white mb-2">No subscriptions found</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
              Get started by adding recurring services like Netflix, Spotify, or cloud hosting.
            </p>
            <button
              onClick={() => {
                setEditingSub(null);
                setIsSubModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl"
            >
              Add First Subscription
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                onEdit={(s) => {
                  setEditingSub(s);
                  setIsSubModalOpen(true);
                }}
                onDelete={async (s) => {
                  if (confirm(`Delete ${s.name}?`)) {
                    try {
                      await api.deleteSubscription(s.id);
                      loadData();
                      loadCategories();
                    } catch (err) {
                      console.error('Failed to delete subscription:', err);
                      alert(`Failed to delete subscription: ${err.message || 'Unknown error'}`);
                    }
                  }
                }}
                onToggle={async (s) => {
                  try {
                    await api.toggleSubscription(s.id);
                    loadData();
                  } catch (err) {
                    console.error('Failed to toggle subscription:', err);
                    alert(`Failed to toggle subscription: ${err.message || 'Unknown error'}`);
                  }
                }}
              />
            ))}
          </div>
        )}
      </main>

      <SubscriptionModal
        isOpen={isSubModalOpen}
        editingSub={editingSub}
        onClose={() => setIsSubModalOpen(false)}
        onSave={async (formData) => {
          if (editingSub) {
            await api.updateSubscription(editingSub.id, formData);
          } else {
            await api.createSubscription(formData);
          }
          loadData();
          loadCategories();
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
