# EmergentLike

**Construis des apps avec l'IA, vite.** / Build apps with AI, fast.

A premium bilingual (FR/EN) full-stack AI builder platform inspired by Emergent — powered by **GPT-4o-mini**, **FastAPI**, **React + Vite + Tailwind**, and **MongoDB**.

## Features

- 🏗️ **Builder Home** (`/`) — Emergent-style dark UI with mode tabs, prompt box, template chips, and a recent-tasks dashboard
- 🤖 **AI Task Generation** — Submitting a prompt creates a task; OpenAI generates a structured plan/spec (title, description, tech stack, features, pages, API endpoints)
- 💬 **Chat** (`/chat`) — Real-time streaming chat with GPT-4o-mini, with persistent conversation history
- 📋 **Task Detail** (`/tasks/:id`) — View generated plan with live status polling
- 🌐 **Bilingual** — French primary, English secondary throughout the UI

---

## Routes

| Path | Description |
|------|-------------|
| `/` | Home / Builder (Emergent-style) |
| `/chat` | Streaming chat UI |
| `/tasks/:id` | Task detail / generated plan |

---

## Project Structure

```
EmergentLike/
├── backend/
│   ├── server.py          # FastAPI server (chat, conversations, tasks)
│   ├── dev_server.py      # Dev launcher — uses in-memory MongoDB (no install needed)
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── .env.example
│   └── tests/
│       ├── test_task_pipeline.py   # End-to-end task/build flow tests
│       └── test_chat_endpoint.py   # Chat streaming & placeholder-mode tests
└── frontend/
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── components/
    │   │   └── Chat.jsx   # Streaming chat component
    │   └── pages/
    │       ├── Home.jsx   # Builder home page
    │       └── Task.jsx   # Task detail page
    ├── index.html
    ├── package.json
    └── .env.example
```

---

## Getting Started

### Option A — Quick start (no MongoDB required)

`dev_server.py` uses **mongomock-motor** (in-memory MongoDB) so you can run the full stack without installing MongoDB.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install mongomock-motor

# Optional: add your real OpenAI key, or leave blank for demo/placeholder mode
export OPENAI_API_KEY=sk-...   # omit to use placeholder output

python dev_server.py           # starts on http://127.0.0.1:8000
```

### Option B — Full production setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env

# Start the server (requires MongoDB running)
uvicorn server:app --reload --port 8000
```

**Environment variables** (`backend/.env`):

| Variable | Description |
|----------|-------------|
| `MONGO_URL` | MongoDB connection string (e.g. `mongodb://localhost:27017`) |
| `DB_NAME` | Database name (e.g. `emergentlike`) |
| `OPENAI_API_KEY` | OpenAI API key — leave blank or use `sk-placeholder` for demo mode |
| `CORS_ORIGINS` | Allowed origins (comma-separated) |

> **Demo mode**: if `OPENAI_API_KEY` is not set or starts with `sk-placeholder`, the task builder returns a structured placeholder plan and the chat returns a demo message — no API key required.

### Frontend

```bash
cd frontend
npm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env: set VITE_BACKEND_URL=http://localhost:8000

# Start development server
npm run dev
```

**Environment variables** (`frontend/.env`):

| Variable | Description |
|----------|-------------|
| `VITE_BACKEND_URL` | Backend API base URL (e.g. `http://localhost:8000`) |

Then open [http://localhost:5173](http://localhost:5173).

### Running Tests

```bash
cd backend
pip install pytest pytest-asyncio mongomock-motor httpx
pytest                    # runs all 11 tests
pytest -v -s              # verbose output showing the generated plan
```

---

## API Endpoints

### Chat & Conversations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/` | Health check |
| `GET` | `/api/conversations` | List conversations |
| `POST` | `/api/conversations` | Create conversation |
| `DELETE` | `/api/conversations/:id` | Delete conversation |
| `GET` | `/api/conversations/:id/messages` | List messages |
| `POST` | `/api/chat` | Send message (SSE streaming) |

### Builder Tasks

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tasks` | Create a builder task `{ mode, prompt }` |
| `GET` | `/api/tasks` | List tasks (most recent first) |
| `GET` | `/api/tasks/:id` | Get task (with generated output) |
| `DELETE` | `/api/tasks/:id` | Delete task |

#### Task object

```json
{
  "id": "uuid",
  "mode": "fullstack | mobile | landing",
  "prompt": "Construis-moi une app SaaS pour…",
  "status": "queued | running | succeeded | failed",
  "output": "<JSON plan or null>",
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime"
}
```

