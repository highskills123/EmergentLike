"""
Tests for the chat streaming endpoint, verifying placeholder mode
works gracefully when no real OpenAI API key is configured.
"""
import json
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "emergentlike_test")
os.environ.setdefault("OPENAI_API_KEY", "sk-placeholder-test")
os.environ.setdefault("CORS_ORIGINS", "*")

import server  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def mock_db(monkeypatch):
    mock_client = AsyncMongoMockClient()
    mock_database = mock_client["emergentlike_test"]
    monkeypatch.setattr(server, "db", mock_database)
    yield mock_database


def _parse_sse(raw: str) -> list[dict]:
    """Parse server-sent-events stream body into a list of event dicts."""
    events = []
    for line in raw.splitlines():
        if line.startswith("data: "):
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass
    return events


@pytest.mark.asyncio
async def test_chat_placeholder_mode():
    """
    POST /api/chat with no real API key returns a placeholder response
    (SSE stream) without crashing.
    """
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/chat",
            json={"message": "Hello, what can you do?"},
        )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    events = _parse_sse(resp.text)
    types = [e["type"] for e in events]

    assert "start" in types, "Stream must begin with a 'start' event"
    assert "chunk" in types, "Stream must include at least one 'chunk' event"
    assert "done" in types, "Stream must end with a 'done' event"

    # start event includes conversation_id so the UI can redirect
    start = next(e for e in events if e["type"] == "start")
    assert "conversation_id" in start

    # Combined chunk content should mention the placeholder notice
    combined = "".join(e.get("content", "") for e in events if e["type"] == "chunk")
    assert len(combined) > 0, "Placeholder response should not be empty"


@pytest.mark.asyncio
async def test_chat_creates_conversation():
    """Chat without a conversation_id auto-creates a conversation."""
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/chat",
            json={"message": "Build me a recipe app"},
        )
        events = _parse_sse(resp.text)
        start = next(e for e in events if e["type"] == "start")
        conv_id = start["conversation_id"]

        # The conversation should now be retrievable
        conv_resp = await client.get(f"/api/conversations/{conv_id}")
    assert conv_resp.status_code == 200
    assert conv_resp.json()["id"] == conv_id


@pytest.mark.asyncio
async def test_chat_persists_messages(mock_db):
    """Both the user message and the assistant reply are saved to the DB."""
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/chat",
            json={"message": "Tell me about React"},
        )
        events = _parse_sse(resp.text)
        conv_id = next(e for e in events if e["type"] == "start")["conversation_id"]

        msgs_resp = await client.get(f"/api/conversations/{conv_id}/messages")

    messages = msgs_resp.json()
    assert len(messages) == 2, f"Expected 2 messages (user + assistant), got {len(messages)}"
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "Tell me about React"
    assert messages[1]["role"] == "assistant"
    assert len(messages[1]["content"]) > 0


@pytest.mark.asyncio
async def test_server_starts_without_openai_key(monkeypatch):
    """
    The server should not crash at import/startup time when OPENAI_API_KEY
    is absent or blank. This validates the critical startup bug fix.
    """
    import importlib

    # Remove the key from the environment temporarily
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    # Re-loading server would crash before the fix; now it must succeed
    try:
        importlib.reload(server)
        started = True
    except Exception as exc:
        started = False
        print(f"Startup failed: {exc}")

    # Restore env so other tests still work
    os.environ["OPENAI_API_KEY"] = "sk-placeholder-test"
    importlib.reload(server)

    assert started, "Server must not crash when OPENAI_API_KEY is not set"
