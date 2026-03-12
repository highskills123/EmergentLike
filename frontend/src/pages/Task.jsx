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

const STATUS_COLORS = {
  queued: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  running: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  succeeded: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
  failed: 'text-red-400 bg-red-400/10 border-red-400/30',
};

const STATUS_LABELS = {
  queued: 'En attente',
  running: 'Génération en cours…',
  succeeded: 'Terminé',
  failed: 'Échoué',
};

function PlanCard({ output }) {
  let parsed = null;
  try {
    parsed = JSON.parse(output);
  } catch {
    // output is not JSON — render as raw text below
  }

  if (!parsed) {
    return (
      <pre className="bg-[#0d0d0f] border border-white/10 rounded-xl p-4 text-sm text-white/80 whitespace-pre-wrap overflow-auto">
        {output}
      </pre>
    );
  }

  return (
    <div className="space-y-5">
      {parsed.title && (
        <div>
          <h3 className="text-white font-bold text-xl">{parsed.title}</h3>
          {parsed.description && (
            <p className="text-white/60 text-sm mt-1 leading-relaxed">{parsed.description}</p>
          )}
        </div>
      )}

      {parsed.tech_stack && parsed.tech_stack.length > 0 && (
        <div>
          <h4 className="text-white/50 text-xs uppercase tracking-widest mb-2">Stack technique</h4>
          <div className="flex flex-wrap gap-2">
            {parsed.tech_stack.map((tech) => (
              <span
                key={tech}
                className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/15 border border-indigo-500/30 text-indigo-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.features && parsed.features.length > 0 && (
        <div>
          <h4 className="text-white/50 text-xs uppercase tracking-widest mb-2">Fonctionnalités</h4>
          <ul className="space-y-1.5">
            {parsed.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                <span className="text-emerald-400 mt-0.5">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed.pages && parsed.pages.length > 0 && (
        <div>
          <h4 className="text-white/50 text-xs uppercase tracking-widest mb-2">Pages</h4>
          <div className="flex flex-wrap gap-2">
            {parsed.pages.map((p) => (
              <span
                key={p}
                className="px-3 py-1 rounded-full text-xs bg-white/5 border border-white/15 text-white/60"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {parsed.api_endpoints && parsed.api_endpoints.length > 0 && (
        <div>
          <h4 className="text-white/50 text-xs uppercase tracking-widest mb-2">
            Endpoints API
          </h4>
          <ul className="space-y-1">
            {parsed.api_endpoints.map((ep) => (
              <li key={ep} className="font-mono text-xs text-white/60 bg-white/5 px-3 py-1.5 rounded-lg">
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

  // Poll while task is running or queued
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

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white flex flex-col">
      {/* Top nav */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center space-x-4">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-xs font-bold">
              E
            </div>
            <span className="font-semibold text-sm tracking-wide text-white">EmergentLike</span>
          </Link>
          <span className="text-white/30">/</span>
          <span className="text-white/60 text-sm">Tâche</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="px-3 py-1.5 rounded-md border border-white/20 text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
          >
            ← Accueil
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full">
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
          <div className="space-y-6">
            {/* Task header */}
            <div className="bg-[#18181b] border border-white/10 rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-1">
                    {MODES[task.mode] || task.mode}
                  </p>
                  <h1 className="text-lg font-semibold text-white leading-snug break-words">
                    {task.prompt}
                  </h1>
                </div>
                <button
                  onClick={handleDelete}
                  className="flex-shrink-0 p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  title="Supprimer la tâche"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    STATUS_COLORS[task.status] || 'text-white/50 border-white/20'
                  }`}
                >
                  {STATUS_LABELS[task.status] || task.status}
                </span>
                <span className="text-xs text-white/30">
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

            {/* Running spinner */}
            {(task.status === 'queued' || task.status === 'running') && (
              <div className="bg-[#18181b] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4">
                <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-white/50 text-sm">Génération du plan en cours…</p>
              </div>
            )}

            {/* Output */}
            {task.status === 'succeeded' && task.output && (
              <div className="bg-[#18181b] border border-white/10 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest mb-5">
                  Plan généré
                </h2>
                <PlanCard output={task.output} />
              </div>
            )}

            {task.status === 'failed' && (
              <div className="bg-[#18181b] border border-red-500/20 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-red-400 uppercase tracking-widest mb-3">
                  Erreur
                </h2>
                <p className="text-white/60 text-sm">{task.output || 'Une erreur est survenue.'}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
