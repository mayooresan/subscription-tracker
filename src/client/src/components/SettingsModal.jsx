import React, { useState, useEffect } from 'react';
import { X, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../api.js';

export function SettingsModal({ isOpen, onClose }) {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [maskedToken, setMaskedToken] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (isOpen) {
      api.getSettings().then((s) => {
        setMaskedToken(s.telegram_bot_token_masked || '');
        setChatId(s.telegram_chat_id || '');
      });
      api.getLogs().then(setLogs);
      setStatusMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSave(e) {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('');
    try {
      await api.updateSettings({
        telegram_bot_token: token || undefined,
        telegram_chat_id: chatId,
      });
      setStatusMsg('Telegram settings updated successfully!');
      setIsError(false);
      setToken('');
      const updated = await api.getSettings();
      setMaskedToken(updated.telegram_bot_token_masked);
    } catch (err) {
      setStatusMsg(err.message || 'Failed to save settings');
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleTestNotification() {
    setLoading(true);
    setStatusMsg('');
    try {
      await api.testTelegram({
        telegram_bot_token: token || undefined,
        telegram_chat_id: chatId,
      });
      setStatusMsg('Test alert delivered to Telegram successfully! Check your chat.');
      setIsError(false);
      api.getLogs().then(setLogs);
    } catch (err) {
      setStatusMsg(`Delivery failed: ${err.message}`);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-white">Telegram Notification Settings</h2>
            <p className="text-xs text-slate-400">Receive alerts 24 hours before any subscription renews</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMsg && (
          <div className={`mt-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
            isError ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
          }`}>
            {isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{statusMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Telegram Bot Token
            </label>
            <input
              type="text"
              placeholder={maskedToken ? `Current: ${maskedToken}` : 'e.g. 123456789:ABCdefGhIJKlmNo...'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Create a bot with <span className="text-indigo-400">@BotFather</span> on Telegram to get your token.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Telegram Chat ID
            </label>
            <input
              type="text"
              placeholder="e.g. 987654321"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Message <span className="text-indigo-400">@userinfobot</span> on Telegram to discover your Chat ID.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="button"
              disabled={loading || (!chatId && !maskedToken)}
              onClick={handleTestNotification}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Test Notification</span>
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              Save Settings
            </button>
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Recent Notification History</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-xs text-slate-500">No notifications sent yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="text-xs flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="font-medium text-white">{log.subscription_name}</span>
                    <span className="text-slate-400 ml-2">Cycle: {log.renewal_date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      log.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {log.status}
                    </span>
                    <span className="text-slate-500">{new Date(log.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
