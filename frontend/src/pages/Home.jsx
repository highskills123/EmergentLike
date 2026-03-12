import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MODES = [
  { key: 'fullstack', labelFr: 'Application Full Stack', labelEn: 'Full Stack App' },
  { key: 'mobile', labelFr: 'Application mobile', labelEn: 'Mobile App' },
  { key: 'landing', labelFr: "Page d'atterrissage", labelEn: 'Landing Page' },
];

const TEMPLATES = [
  { key: 'moltbot', label: 'MoltBot' },
  { key: 'alter-ego', label: 'Mon alter ego' },
  { key: 'invoices', label: 'Générateur de factures' },
  { key: 'word-of-day', label: 'Mot du jour' },
];

const TEMPLATE_PROMPTS = {
  moltbot: 'un chatbot IA personnalisé avec personnalité configurable et historique des conversations',
  'alter-ego': 'une application qui crée un alter ego IA basé sur ma personnalité et mes écrits',
  invoices: 'un générateur de factures professionnel avec gestion clients et export PDF',
  'word-of-day': 'une application du mot du jour avec définitions, exemples et quiz quotidien',
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return `Il y a ${Math.floor(diff / 86400)}j`;
}

const STATUS_COLORS = {
  queued: 'text-yellow-400',
  running: 'text-blue-400',
  succeeded: 'text-emerald-400',
  failed: 'text-red-400',
};

const STATUS_LABELS = {
  queued: 'En attente',
  running: 'En cours…',
  succeeded: 'Terminé',
  failed: 'Échoué',
};

export default function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('fullstack');
  const [prompt, setPrompt] = useState('');
  const [tasks, setTasks] = useState([]);
  const [activeTab, setActiveTab] = useState('tasks');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadTasks = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/tasks`);
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    // Poll for task status updates every 3 seconds
    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const handleTemplate = (key) => {
    setPrompt(TEMPLATE_PROMPTS[key] || '');
  };

  const handleSubmit = async () => {
    const text = prompt.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await axios.post(`${API}/tasks`, { mode, prompt: text });
      await loadTasks();
      navigate(`/tasks/${data.id}`);
    } catch (err) {
      console.error('Failed to create task:', err);
      setError('Impossible de créer la tâche. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white flex flex-col">
      {/* ── Top Nav ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-xs font-bold">
              E
            </div>
            <span className="font-semibold text-sm tracking-wide text-white">EmergentLike</span>
          </div>
          <nav className="hidden md:flex items-center space-x-1">
            <span className="px-3 py-1.5 rounded-md bg-white/10 text-sm font-medium text-white">
              Accueil
            </span>
            <Link
              to="/chat"
              className="px-3 py-1.5 rounded-md text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              Chat
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/chat"
            className="hidden md:inline-flex px-3 py-1.5 rounded-md border border-white/20 text-sm text-white/70 hover:text-white hover:border-white/40 transition-colors"
          >
            Chat IA
          </Link>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
            Bp
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col items-center px-4 py-12 md:py-20">
        {/* Hero headline */}
        <div className="text-center mb-10 max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
            Que construirez-vous aujourd'hui&nbsp;?
          </h1>
          <p className="text-base md:text-lg text-white/50 font-light">
            What will you build today? — AI-powered, production-ready, fast.
          </p>
        </div>

        {/* Builder card */}
        <div className="w-full max-w-2xl bg-[#18181b] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          {/* Mode tabs */}
          <div className="flex border-b border-white/10">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  mode === m.key
                    ? 'text-white border-b-2 border-indigo-500 bg-white/5'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {m.labelFr}
              </button>
            ))}
          </div>

          {/* Prompt area */}
          <div className="p-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Construis‑moi une application SaaS pour…"
              rows={4}
              className="w-full bg-transparent text-white placeholder-white/30 text-sm resize-none focus:outline-none leading-relaxed"
            />
          </div>

          {/* Controls row */}
          <div className="px-4 pb-4 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full border border-white/20 text-xs text-white/60 bg-white/5">
                E‑1
              </span>
              <span className="px-3 py-1 rounded-full border border-white/20 text-xs text-white/60 bg-white/5">
                Ultra
              </span>
              <span className="px-3 py-1 rounded-full border border-indigo-500/50 text-xs text-indigo-300 bg-indigo-500/10">
                GPT-4o-mini
              </span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || submitting}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Génération…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Construire
                </>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-4 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Template chips */}
          <div className="px-4 pb-5 flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTemplate(t.key)}
                className="px-3 py-1.5 rounded-full border border-white/15 text-xs text-white/60 hover:text-white hover:border-white/40 bg-white/5 hover:bg-white/10 transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="mt-3 text-xs text-white/30">
          Appuyez sur{' '}
          <kbd className="px-1.5 py-0.5 rounded border border-white/20 font-mono bg-white/5">⌘ Enter</kbd>{' '}
          pour lancer la génération
        </p>

        {/* ── Dashboard panel ── */}
        <div className="w-full max-w-2xl mt-10 bg-[#18181b] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          {/* Dashboard tabs */}
          <div className="flex border-b border-white/10">
            {[
              { key: 'tasks', labelFr: 'Tâches récentes', labelEn: 'Recent Tasks' },
              { key: 'deployments', labelFr: 'Applications déployées', labelEn: 'Deployed Apps' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-white border-b-2 border-indigo-500'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {tab.labelFr}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'tasks' ? (
            <div>
              {tasks.length === 0 ? (
                <div className="py-12 text-center text-white/40 text-sm">
                  Aucune tâche récente. Lancez votre première construction&nbsp;!
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-white/40 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">Projet</th>
                      <th className="px-5 py-3 text-left hidden md:table-cell">Mode</th>
                      <th className="px-5 py-3 text-left">Statut</th>
                      <th className="px-5 py-3 text-right">Dernière modification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr
                        key={task.id}
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 text-white font-medium truncate max-w-[200px]">
                          {task.prompt.length > 40 ? task.prompt.slice(0, 40) + '…' : task.prompt}
                        </td>
                        <td className="px-5 py-3 text-white/50 hidden md:table-cell">
                          {MODES.find((m) => m.key === task.mode)?.labelFr || task.mode}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`font-medium ${STATUS_COLORS[task.status] || 'text-white/50'}`}>
                            {STATUS_LABELS[task.status] || task.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-white/40 text-right whitespace-nowrap">
                          {timeAgo(task.updated_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-white/40 text-sm">
              Aucune application déployée pour le moment.
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="py-6 text-center text-xs text-white/25 border-t border-white/5">
        EmergentLike — Propulsé par GPT-4o-mini · Construis tes idées, aujourd'hui.
      </footer>
    </div>
  );
}
