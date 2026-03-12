"""
Integration tests for the EmergentLike task-generation pipeline.
These tests use mongomock-motor to simulate MongoDB in-memory so no real
database is required.
"""
import json
import os
import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

# ------------------------------------------------------------------
# Environment stubs — must be set BEFORE importing server.py because
# server.py reads them at module import time via os.environ.
# ------------------------------------------------------------------
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "emergentlike_test")
os.environ.setdefault("OPENAI_API_KEY", "sk-placeholder-test")
os.environ.setdefault("CORS_ORIGINS", "*")

import server  # noqa: E402 — must come after env stubs


@pytest_asyncio.fixture(autouse=True)
async def mock_db(monkeypatch):
    """Replace the real Motor client/db with an in-memory mongomock client."""
    mock_client = AsyncMongoMockClient()
    mock_database = mock_client["emergentlike_test"]
    monkeypatch.setattr(server, "db", mock_database)
    yield mock_database


@pytest.mark.asyncio
async def test_list_tasks_empty():
    """GET /api/tasks returns an empty list when no tasks exist."""
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        response = await client.get("/api/tasks")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_task_returns_queued():
    """POST /api/tasks immediately returns a task in 'queued' state."""
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/tasks",
            json={"mode": "fullstack", "prompt": "a todo app with authentication"},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "queued"
    assert data["mode"] == "fullstack"
    assert data["prompt"] == "a todo app with authentication"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_and_retrieve_task(mock_db):
    """POST then GET returns the same task."""
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        create_resp = await client.post(
            "/api/tasks",
            json={"mode": "landing", "prompt": "landing page for a SaaS startup"},
        )
        assert create_resp.status_code == 200
        task_id = create_resp.json()["id"]

        get_resp = await client.get(f"/api/tasks/{task_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == task_id
    assert get_resp.json()["prompt"] == "landing page for a SaaS startup"


@pytest.mark.asyncio
async def test_run_task_placeholder_output(mock_db):
    """
    _run_task produces a valid JSON plan when no real OpenAI key is configured.
    This simulates the full 'build something' pipeline end-to-end.
    """
    # Insert a task document directly
    task = server.Task(mode="fullstack", prompt="a recipe manager with meal planning")
    doc = task.model_dump()
    doc["created_at"] = server.datetime_to_iso(doc["created_at"])
    doc["updated_at"] = server.datetime_to_iso(doc["updated_at"])
    await mock_db.tasks.insert_one(doc)

    # Run the task pipeline (uses placeholder path since OPENAI_API_KEY starts with sk-placeholder)
    await server._run_task(task.id, task.mode, task.prompt)

    # Retrieve updated document
    updated = await mock_db.tasks.find_one({"id": task.id}, {"_id": 0})
    assert updated["status"] == "succeeded", f"Expected succeeded, got: {updated['status']}"
    assert updated["output"] is not None

    plan = json.loads(updated["output"])
    assert "title" in plan, "Plan must have a 'title' field"
    assert "tech_stack" in plan, "Plan must have a 'tech_stack' field"
    assert "features" in plan, "Plan must have a 'features' field"
    assert "pages" in plan, "Plan must have a 'pages' field"
    assert "api_endpoints" in plan, "Plan must have an 'api_endpoints' field"

    # Title should be the first 40 chars of the prompt
    assert plan["title"] == task.prompt[:40]
    assert isinstance(plan["tech_stack"], list)
    assert isinstance(plan["features"], list)
    assert len(plan["tech_stack"]) > 0
    assert len(plan["features"]) > 0


@pytest.mark.asyncio
async def test_full_build_flow_via_api(mock_db):
    """
    Full end-to-end test: submit a prompt, wait for the background task to
    complete, then verify the task is succeeded with a valid plan.

    This is what happens when a user clicks 'Build' in the UI.
    """
    prompt = "a project management tool with kanban boards and time tracking"
    mode = "fullstack"

    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        # Step 1: Submit the build request (like clicking the → button)
        create_resp = await client.post(
            "/api/tasks", json={"mode": mode, "prompt": prompt}
        )
        assert create_resp.status_code == 200
        task_data = create_resp.json()
        task_id = task_data["id"]
        assert task_data["status"] == "queued"

        # Step 2: Wait for the background task to complete (poll like the UI does)
        for _ in range(20):
            await asyncio.sleep(0.1)
            poll_resp = await client.get(f"/api/tasks/{task_id}")
            assert poll_resp.status_code == 200
            if poll_resp.json()["status"] in ("succeeded", "failed"):
                break

        final = poll_resp.json()

    # Step 3: Verify the generated plan
    assert final["status"] == "succeeded", f"Task failed: {final.get('output')}"
    assert final["output"] is not None

    plan = json.loads(final["output"])
    assert plan["title"], "Generated plan must have a non-empty title"
    assert len(plan["tech_stack"]) > 0, "Plan must list tech stack"
    assert len(plan["features"]) > 0, "Plan must list features"
    assert len(plan["pages"]) > 0, "Plan must list pages"
    assert len(plan["api_endpoints"]) > 0, "Plan must list API endpoints"

    print(f"\n✅ Build succeeded!")
    print(f"   Prompt : {prompt}")
    print(f"   Title  : {plan['title']}")
    print(f"   Stack  : {', '.join(plan['tech_stack'])}")
    print(f"   Features ({len(plan['features'])}): {plan['features'][0]}, …")
    print(f"   Pages  : {', '.join(plan['pages'])}")
    print(f"   API    : {plan['api_endpoints'][0]}, …")


@pytest.mark.asyncio
async def test_delete_task(mock_db):
    """DELETE /api/tasks/:id removes the task."""
    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        create_resp = await client.post(
            "/api/tasks",
            json={"mode": "mobile", "prompt": "fitness tracking app"},
        )
        task_id = create_resp.json()["id"]

        del_resp = await client.delete(f"/api/tasks/{task_id}")
        assert del_resp.status_code == 200

        get_resp = await client.get(f"/api/tasks/{task_id}")
        assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_tasks_list_shows_latest_first(mock_db):
    """GET /api/tasks returns tasks sorted by created_at descending."""
    prompts = ["first app", "second app", "third app"]
    ids = []

    async with AsyncClient(
        transport=ASGITransport(app=server.app), base_url="http://test"
    ) as client:
        for p in prompts:
            resp = await client.post("/api/tasks", json={"mode": "fullstack", "prompt": p})
            ids.append(resp.json()["id"])
            await asyncio.sleep(0.01)  # ensure distinct created_at

        list_resp = await client.get("/api/tasks")

    tasks = list_resp.json()
    assert len(tasks) == 3
    # Latest created should be first
    assert tasks[0]["prompt"] == "third app"
    assert tasks[-1]["prompt"] == "first app"
