"""
dev_server.py — Run the EmergentLike backend with an in-memory MongoDB
(mongomock-motor), so no real MongoDB installation is required for local
development and CI.

Usage:
    python dev_server.py
"""
import os
import sys

# ── Environment stubs (must come before importing server) ──────────────────
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "emergentlike_dev")
os.environ.setdefault("OPENAI_API_KEY", os.environ.get("OPENAI_API_KEY", "sk-placeholder-dev"))
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")

# Patch motor with mongomock-motor BEFORE server.py creates the client
from mongomock_motor import AsyncMongoMockClient  # noqa: E402
import server  # noqa: E402

mock_client = AsyncMongoMockClient()
server.db = mock_client[os.environ["DB_NAME"]]

import uvicorn  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"🚀  EmergentLike dev server (in-memory MongoDB) → http://127.0.0.1:{port}")
    uvicorn.run(server.app, host="127.0.0.1", port=port, log_level="info")
