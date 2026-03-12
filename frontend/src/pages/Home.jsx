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
  { key: 'moltbot', label: 'MoltBot', isNew: true },
  { key: 'alter-ego', label: 'Mon alter ego', isNew: false },
  { key: 'invoices', label: 'Générateur de factures', isNew: false },
  { key: 'word-of-day', label: 'Mot du jour', isNew: false },
];

const TEMPLATE_PROMPTS = {
  moltbot: 'un chatbot IA personnalisé avec personnalité configurable et historique des conversations',
  'alter-ego': 'une application qui crée un alter ego IA basé sur ma personnalité et mes écrits',
  invoices: 'un générateur de factures professionnel avec gestion clients et export PDF',
  'word-of-day': 'une application du mot du jour avec définitions, exemples et quiz quotidien',
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  return `Il y a ${Math.floor(diff / 86400)}j`;
}

const STATUS_DOT = {
  queued: 'bg-yellow-400',
  running: 'bg-blue-400 animate-pulse',
  succeeded: 'bg-emerald-400',
  failed: 'bg-red-400',
};

const STATUS_TEXT = {
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

/** Extract the generated plan title from task output JSON, or fall back to prompt */
function taskTitle(task) {
  if (task.output) {
    try {
      const parsed = JSON.parse(task.output);
      if (parsed.title) return parsed.title;
    } catch {
      // not JSON
    }
  }
  return task.prompt.length > 44 ? task.prompt.slice(0, 44) + '…' : task.prompt;
}

// ── Icons ──────────────────────────────────────────────
function IconPaperclip() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  );
}

function IconMic() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconSliders() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  );
}

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
      if (Array.isArray(data)) setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  }, []);

  useEffect(() => {
    loadTasks();
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
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col">
      {/* Radial glow background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(99,60,255,0.18) 0%, transparent 70%)',
        }}
      />

      {/* ── Top Nav ── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
        <div className="flex items-center space-x-5">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-xs font-bold shadow-lg shadow-indigo-500/30">
              E
            </div>
            <span className="font-semibold text-sm tracking-wide text-white">EmergentLike</span>
          </div>
          <nav className="hidden md:flex items-center space-x-1">
            <span className="px-3 py-1.5 rounded-md bg-white/[0.08] text-sm font-medium text-white">
              Accueil
            </span>
            <Link
              to="/chat"
              className="px-3 py-1.5 rounded-md text-sm font-medium text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              Chat IA
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-3">
          {/* Credit balance */}
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs text-white/50">
            <span className="text-emerald-400">◈</span>
            Crédits
          </span>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold shadow-lg shadow-indigo-500/20">
            Bp
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-4 py-12 md:py-16">
        {/* Hero headline */}
        <div className="text-center mb-10 max-w-3xl">
          <h1 className="text-4xl md:text-[3.25rem] font-bold tracking-tight text-white leading-tight mb-3">
            Que construirez-vous aujourd'hui&nbsp;?
          </h1>
          <p className="text-base md:text-lg text-white/40 font-light">
            What will you build today? — AI-powered, production-ready, fast.
          </p>
        </div>

        {/* Builder card — with glow ring */}
        <div className="relative w-full max-w-3xl">
          {/* Glow behind card */}
          <div
            aria-hidden="true"
            className="absolute -inset-px rounded-2xl pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(99,60,255,0.22) 0%, transparent 70%)',
              filter: 'blur(1px)',
            }}
          />
          <div className="relative bg-[#141416] border border-white/[0.09] rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
            {/* Mode tabs */}
            <div className="flex border-b border-white/[0.07]">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    mode === m.key
                      ? 'text-white border-b-2 border-indigo-500 bg-white/[0.04]'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {m.labelFr}
                </button>
              ))}
            </div>

            {/* Prompt textarea */}
            <div className="px-4 pt-4 pb-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Construis‑moi une application SaaS pour…"
                rows={4}
                className="w-full bg-transparent text-white placeholder-white/25 text-sm resize-none focus:outline-none leading-relaxed"
              />
            </div>

            {/* Controls row */}
            <div className="px-4 pb-4 flex items-center justify-between gap-2">
              {/* Left: attach + tier chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                  title="Joindre un fichier"
                >
                  <IconPaperclip />
                </button>
                <span className="px-2.5 py-1 rounded-full border border-white/[0.12] text-xs text-white/50 bg-white/[0.04]">
                  E‑1
                </span>
                <span className="px-2.5 py-1 rounded-full border border-white/[0.12] text-xs text-white/50 bg-white/[0.04]">
                  Ultra
                </span>
                <span className="px-2.5 py-1 rounded-full border border-indigo-500/40 text-xs text-indigo-300/80 bg-indigo-500/[0.08]">
                  GPT-4o-mini
                </span>
                <button
                  className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                  title="Paramètres"
                >
                  <IconSliders />
                </button>
              </div>

              {/* Right: mic + send */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                  title="Microphone"
                >
                  <IconMic />
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || submitting}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-35 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-600/30"
                  title="Construire"
                >
                  {submitting ? (
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <IconSend />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-4 mb-3 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Template chips */}
            <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2 border-t border-white/[0.05]">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => handleTemplate(t.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/[0.1] text-xs text-white/50 hover:text-white hover:border-white/30 bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
                >
                  {t.label}
                  {t.isNew && (
                    <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-medium leading-none">
                      New
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="mt-3 text-xs text-white/25">
          <kbd className="px-1.5 py-0.5 rounded border border-white/[0.12] font-mono bg-white/[0.04]">
            {typeof navigator !== 'undefined' &&
            (navigator.userAgentData?.platform ?? navigator.userAgent).toLowerCase().includes('mac')
              ? '⌘'
              : 'Ctrl'}{' '}Enter
          </kbd>
          {' '}pour lancer · cliquez{' '}
          <span className="inline-flex items-center">
            <span className="w-4 h-4 rounded-full bg-indigo-600/60 text-white text-[9px] font-bold inline-flex items-center justify-center">→</span>
          </span>
          {' '}pour envoyer
        </p>

        {/* ── Dashboard panel ── */}
        <div className="relative w-full max-w-3xl mt-10 bg-[#141416] border border-white/[0.07] rounded-2xl overflow-hidden shadow-xl shadow-black/40">
          {/* Dashboard tabs */}
          <div className="flex border-b border-white/[0.07]">
            {[
              { key: 'tasks', label: 'Tâches récentes' },
              { key: 'deployments', label: 'Applications déployées' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-white border-b-2 border-indigo-500'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'tasks' ? (
            tasks.length === 0 ? (
              <div className="py-14 text-center text-white/30 text-sm">
                Aucune tâche récente — lancez votre première construction&nbsp;!
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.05] text-xs text-white/30 uppercase tracking-wider">
                    <th className="px-5 py-3 text-left">Projet</th>
                    <th className="px-5 py-3 text-left hidden md:table-cell">Mode</th>
                    <th className="px-5 py-3 text-left">Statut</th>
                    <th className="px-5 py-3 text-right">Dernière modif.</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors last:border-0"
                    >
                      <td className="px-5 py-3.5 text-white/90 font-medium">
                        <span className="truncate block max-w-[200px]">{taskTitle(task)}</span>
                      </td>
                      <td className="px-5 py-3.5 text-white/40 hidden md:table-cell text-xs">
                        {MODES.find((m) => m.key === task.mode)?.labelFr || task.mode}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT[task.status] || 'bg-white/30'}`}
                          />
                          <span className={`text-xs ${STATUS_TEXT[task.status] || 'text-white/40'}`}>
                            {STATUS_LABELS[task.status] || task.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-white/30 text-right text-xs whitespace-nowrap">
                        {timeAgo(task.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <div className="py-14 text-center text-white/30 text-sm">
              Aucune application déployée pour le moment.
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 py-5 text-center text-xs text-white/20 border-t border-white/[0.05]">
        EmergentLike · Propulsé par GPT-4o-mini · Construis tes idées, aujourd'hui.
      </footer>
    </div>
  );
}

