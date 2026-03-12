import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MODES = {
  fullstack: 'Application Full Stack',
  mobile: 'Application Mobile',
  landing: "Page d'atterrissage",
};

const STATUS_BADGE = {
  queued: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/25',
  running: 'text-blue-400 bg-blue-400/10 border-blue-400/25',
  succeeded: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  failed: 'text-red-400 bg-red-400/10 border-red-400/25',
};

const STATUS_DOT = {
  queued: 'bg-yellow-400',
  running: 'bg-blue-400 animate-pulse',
  succeeded: 'bg-emerald-400',
  failed: 'bg-red-400',
};

const STATUS_LABELS = {
  queued: 'En attente',
  running: 'Génération en cours…',
  succeeded: 'Terminé',
  failed: 'Échoué',
};

function parsePlan(output) {
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function PlanCard({ output }) {
  const parsed = parsePlan(output);

  if (!parsed) {
    return (
      <pre className="bg-[#0a0a0c] border border-white/[0.07] rounded-xl p-4 text-sm text-white/70 whitespace-pre-wrap overflow-auto">
        {output}
      </pre>
    );
  }

  return (
    <div className="space-y-6">
      {parsed.title && (
        <div>
          <h3 className="text-white font-bold text-xl">{parsed.title}</h3>
          {parsed.description && (
            <p className="text-white/55 text-sm mt-2 leading-relaxed">{parsed.description}</p>
          )}
        </div>
      )}

      {parsed.tech_stack && parsed.tech_stack.length > 0 && (
        <div>
          <h4 className="text-white/35 text-xs uppercase tracking-widest mb-3">Stack technique</h4>
          <div className="flex flex-wrap gap-2">
            {parsed.tech_stack.map((tech) => (
              <span
                key={tech}
                className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 border border-indigo-500/25 text-indigo-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.features && parsed.features.length > 0 && (
        <div>
          <h4 className="text-white/35 text-xs uppercase tracking-widest mb-3">Fonctionnalités</h4>
          <ul className="space-y-2">
            {parsed.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-white/65">
                <span className="text-emerald-400 mt-0.5 text-base leading-none">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.pages && parsed.pages.length > 0 && (
        <div>
          <h4 className="text-white/35 text-xs uppercase tracking-widest mb-3">Pages</h4>
          <div className="flex flex-wrap gap-2">
            {parsed.pages.map((p) => (
              <span
                key={p}
                className="px-3 py-1 rounded-full text-xs bg-white/[0.04] border border-white/[0.1] text-white/55"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.api_endpoints && parsed.api_endpoints.length > 0 && (
        <div>
          <h4 className="text-white/35 text-xs uppercase tracking-widest mb-3">Endpoints API</h4>
          <ul className="space-y-1.5">
            {parsed.api_endpoints.map((ep) => (
              <li
                key={ep}
                className="font-mono text-xs text-white/55 bg-white/[0.04] border border-white/[0.07] px-3 py-2 rounded-lg"
              >
                {ep}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Task() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTask = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/tasks/${id}`);
      setTask(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load task:', err);
      setError('Tâche introuvable.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  // Poll while task is still processing
  useEffect(() => {
    if (!task || task.status === 'succeeded' || task.status === 'failed') return;
    const interval = setInterval(loadTask, 2000);
    return () => clearInterval(interval);
  }, [task, loadTask]);

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cette tâche ?')) return;
    try {
      await axios.delete(`${API}/tasks/${id}`);
      navigate('/');
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  // Derive display title from generated plan or prompt
  const plan = task ? parsePlan(task.output) : null;
  const displayTitle = plan?.title || (task ? task.prompt : '');

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col">
      {/* Subtle glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(99,60,255,0.14) 0%, transparent 70%)',
        }}
      />

      {/* Top nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
        <div className="flex items-center gap-2 text-sm min-w-0">
          <Link to="/" className="flex items-center space-x-2 flex-shrink-0">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-xs font-bold shadow-md shadow-indigo-500/30">
              E
            </div>
            <span className="font-semibold tracking-wide text-white hidden sm:inline">EmergentLike</span>
          </Link>
          <span className="text-white/25 flex-shrink-0">/</span>
          <span className="text-white/50 truncate max-w-[200px] sm:max-w-xs">
            {displayTitle || 'Tâche'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to="/"
            className="px-3 py-1.5 rounded-md border border-white/[0.12] text-xs text-white/50 hover:text-white hover:border-white/30 transition-colors"
          >
            ← Accueil
          </Link>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold">
            Bp
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        )}

        {error && (
          <div className="py-16 text-center">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm underline">
              Retour à l'accueil
            </Link>
          </div>
        )}

        {task && (
          <div className="space-y-5">
            {/* Task header card */}
            <div className="bg-[#141416] border border-white/[0.08] rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/30 uppercase tracking-widest mb-1.5">
                    {MODES[task.mode] || task.mode}
                  </p>
                  <h1 className="text-lg font-semibold text-white leading-snug break-words">
                    {task.prompt}
                  </h1>
                </div>
                <button
                  onClick={handleDelete}
                  className="flex-shrink-0 p-2 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Supprimer la tâche"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                    STATUS_BADGE[task.status] || 'text-white/40 border-white/15'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[task.status] || 'bg-white/30'}`} />
                  {STATUS_LABELS[task.status] || task.status}
                </span>
                <span className="text-xs text-white/25">
                  Créé le{' '}
                  {new Date(task.created_at).toLocaleString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {/* Processing spinner */}
            {(task.status === 'queued' || task.status === 'running') && (
              <div className="bg-[#141416] border border-white/[0.08] rounded-2xl p-10 flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <svg className="animate-spin h-6 w-6 text-indigo-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                </div>
                <p className="text-white/40 text-sm">Génération du plan en cours…</p>
                <p className="text-white/20 text-xs">Rafraîchissement automatique</p>
              </div>
            )}

            {/* Generated output */}
            {task.status === 'succeeded' && task.output && (
              <div className="bg-[#141416] border border-white/[0.08] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                    Plan généré
                  </h2>
                  <Link
                    to="/chat"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-600/30 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Continuer dans le chat
                  </Link>
                </div>
                <PlanCard output={task.output} />
              </div>
            )}

            {task.status === 'failed' && (
              <div className="bg-[#141416] border border-red-500/20 rounded-2xl p-6">
                <h2 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-3">
                  Erreur de génération
                </h2>
                <p className="text-white/50 text-sm">{task.output || 'Une erreur est survenue.'}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

