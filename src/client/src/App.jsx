import React, { useState, useEffect } from 'react';
import { api } from './api.js';
import { Navbar } from './components/Navbar.jsx';
import { LoginView } from './components/LoginView.jsx';

export function App() {
  const [authenticated, setAuthenticated] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    api.checkAuth()
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));

    function handleUnauthorized() {
      setAuthenticated(false);
    }
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        Loading SubTrack...
      </div>
    );
  }

  if (!authenticated) {
    return <LoginView onLoginSuccess={() => setAuthenticated(true)} />;
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
        <div className="text-center text-slate-500 py-12">
          Dashboard components loading...
        </div>
      </main>
    </div>
  );
}
