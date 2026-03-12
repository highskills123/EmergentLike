import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// ---- Typing indicator ----
function TypingIndicator() {
  return (
    <div className="flex space-x-1 items-center px-1 py-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

// ---- Single message bubble ----
function MessageBubble({ message, isStreaming }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-3 flex-shrink-0 mt-1">
          AI
        </div>
      )}
      <div
        className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm shadow-sm ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
        }`}
      >
        {message.content === '' && isStreaming ? (
          <TypingIndicator />
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-bold ml-3 flex-shrink-0 mt-1">
          You
        </div>
      )}
    </div>
  );
}

// ---- Sidebar conversation item ----
function ConversationItem({ conv, isActive, onSelect, onDelete }) {
  return (
    <div
      onClick={() => onSelect(conv)}
      className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer mb-1 transition-colors ${
        isActive
          ? 'bg-slate-600 text-white'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      }`}
    >
      <span className="text-sm truncate flex-1 leading-snug">{conv.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-red-500/30 text-slate-400 hover:text-red-400 ml-2 transition-colors flex-shrink-0"
        title="Delete conversation"
      >
        ×
      </button>
    </div>
  );
}

// ---- Main Chat component ----
export default function Chat() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }
  }, [input]);

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/conversations`);
      if (Array.isArray(data)) setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    try {
      const { data } = await axios.get(
        `${API}/conversations/${conversationId}/messages`
      );
      if (Array.isArray(data)) setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = (conv) => {
    setActiveConversation(conv);
    loadMessages(conv.id);
    setError(null);
  };

  const handleNewChat = () => {
    setActiveConversation(null);
    setMessages([]);
    setInput('');
    setError(null);
  };

  const handleDeleteConversation = async (convId) => {
    try {
      await axios.delete(`${API}/conversations/${convId}`);
      await loadConversations();
      if (activeConversation?.id === convId) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const currentConvId = activeConversation?.id || null;
    setInput('');
    setError(null);
    setIsStreaming(true);

    const tempKey = Date.now();
    setMessages((prev) => [
      ...prev,
      { id: `${tempKey}-user`, role: 'user', content: text },
      { id: `${tempKey}-assistant`, role: 'assistant', content: '' },
    ]);

    let resolvedConvId = currentConvId;

    try {
      const response = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: currentConvId, message: text }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep any incomplete last line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === 'start') {
              resolvedConvId = event.conversation_id;
            } else if (event.type === 'chunk' && event.content) {
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant') {
                  return [
                    ...copy.slice(0, -1),
                    { ...last, content: last.content + event.content },
                  ];
                }
                return copy;
              });
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Unknown streaming error');
            }
          } catch (parseErr) {
            if (parseErr.message !== 'Unexpected end of JSON input') {
              console.warn('SSE parse warning:', parseErr.message);
            }
          }
        }
      }

      // Refresh conversations sidebar
      await loadConversations();

      // If a new conversation was created, select it
      if (!currentConvId && resolvedConvId) {
        const { data: convList } = await axios.get(`${API}/conversations`);
        setConversations(convList);
        const newConv = convList.find((c) => c.id === resolvedConvId);
        if (newConv) setActiveConversation(newConv);
      }

      // Replace temp messages with server-persisted ones
      if (resolvedConvId) {
        await loadMessages(resolvedConvId);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant') {
          return [
            ...copy.slice(0, -1),
            { ...last, content: '⚠️ An error occurred. Please try again.' },
          ];
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-64 bg-slate-800 text-white flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center text-xs font-bold">
                E
              </div>
              <span className="font-semibold text-sm tracking-wide">EmergentLike AI</span>
            </div>
            <Link
              to="/"
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-slate-700 transition-colors"
              title="Retour à l'accueil"
            >
              ← Accueil
            </Link>
          </div>
          <button
            onClick={handleNewChat}
            className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-1"
          >
            <span>+</span>
            <span>New Chat</span>
          </button>
        </div>

        {/* Conversation list */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {conversations.length === 0 ? (
            <p className="text-slate-500 text-xs text-center mt-4 px-2">
              No conversations yet. Start chatting!
            </p>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={activeConversation?.id === conv.id}
                onSelect={handleSelectConversation}
                onDelete={handleDeleteConversation}
              />
            ))
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700">
          <p className="text-slate-500 text-xs text-center">Powered by GPT-4o-mini</p>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0 shadow-sm">
          <h1 className="text-base font-semibold text-slate-800 truncate">
            {activeConversation ? activeConversation.title : 'EmergentLike AI'}
          </h1>
          {activeConversation && (
            <p className="text-xs text-slate-400 mt-0.5">
              {new Date(activeConversation.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
        </header>

        {/* Messages */}
        <section className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 select-none">
              <div className="text-6xl mb-4">🤖</div>
              <p className="text-xl font-semibold text-slate-600">How can I help you today?</p>
              <p className="text-sm mt-2">
                Type a message below to start a conversation.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id || idx}
                message={msg}
                isStreaming={isStreaming && idx === messages.length - 1}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </section>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mb-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* Input area */}
        <footer className="bg-white border-t border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-end space-x-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message EmergentLike AI…"
              rows={1}
              disabled={isStreaming}
              className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed transition-shadow leading-relaxed"
              style={{ minHeight: '48px', maxHeight: '160px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isStreaming ? (
                <span className="flex items-center space-x-1">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Sending</span>
                </span>
              ) : (
                'Send'
              )}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Press <kbd className="bg-slate-100 px-1 py-0.5 rounded text-slate-500 font-mono">Enter</kbd> to send ·{' '}
            <kbd className="bg-slate-100 px-1 py-0.5 rounded text-slate-500 font-mono">Shift+Enter</kbd> for a new line
          </p>
        </footer>
      </main>
    </div>
  );
}
