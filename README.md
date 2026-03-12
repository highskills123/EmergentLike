# EmergentLike
application d'IA conversationnelle

A full-stack conversational AI web application powered by **GPT-4o-mini**, **FastAPI**, **React**, and **MongoDB**.

## Features

- 💬 Real-time streaming chat with GPT-4o-mini
- 📝 Persistent conversation history stored in MongoDB
- 🗂️ Sidebar to browse, select, and delete conversations
- ⚡ Modern React + Vite frontend with Tailwind CSS

---

## Project Structure

```
EmergentLike/
├── backend/          # FastAPI Python server
│   ├── server.py     # Main API (chat, conversations, status)
│   ├── requirements.txt
│   └── .env.example
└── frontend/         # React + Vite + Tailwind CSS
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   └── components/Chat.jsx
    ├── index.html
    ├── package.json
    └── .env.example
```

---

## Getting Started

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env

# Start the server
uvicorn server:app --reload --port 8000
```

**Environment variables** (`backend/.env`):

| Variable | Description |
|----------|-------------|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | Database name |
| `OPENAI_API_KEY` | OpenAI API key |
| `CORS_ORIGINS` | Allowed origins (comma-separated) |

### Frontend

```bash
cd frontend
npm install

# Copy and fill in environment variables
cp .env.example .env

# Start development server
npm run dev
```

**Environment variables** (`frontend/.env`):

| Variable | Description |
|----------|-------------|
| `VITE_BACKEND_URL` | Backend API base URL (e.g. `http://localhost:8000`) |

Then open [http://localhost:3000](http://localhost:3000).

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/` | Health check |
| `GET` | `/api/conversations` | List conversations |
| `POST` | `/api/conversations` | Create conversation |
| `DELETE` | `/api/conversations/:id` | Delete conversation |
| `GET` | `/api/conversations/:id/messages` | List messages |
| `POST` | `/api/chat` | Send message (SSE streaming) |
| `POST` | `/api/status` | Create status check |
| `GET` | `/api/status` | List status checks |
