from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
import json
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from openai import AsyncOpenAI

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Sentinel value used to detect a missing/placeholder OpenAI API key
_PLACEHOLDER_API_KEY_PREFIX = 'sk-placeholder'

# OpenAI client — use a placeholder key when none is configured so the server
# starts cleanly; actual API calls are skipped in placeholder mode.
_openai_api_key = os.environ.get('OPENAI_API_KEY') or f'{_PLACEHOLDER_API_KEY_PREFIX}-unconfigured'
openai_client = AsyncOpenAI(api_key=_openai_api_key)

# True when no real API key is configured (used in chat and task pipeline)
_use_placeholder_ai = not _openai_api_key or _openai_api_key.startswith(_PLACEHOLDER_API_KEY_PREFIX)

# Max characters for the auto-generated plan title in placeholder mode
_PLACEHOLDER_TITLE_MAX_LENGTH = 40

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Module-level set to keep strong references to background tasks
_background_tasks: set = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(title="EmergentLike API", lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# --- Models ---

class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class Conversation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = "New Conversation"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    role: str  # "user" or "assistant"
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str


class Task(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mode: str  # e.g. "fullstack", "mobile", "landing"
    prompt: str
    status: str = "queued"  # queued / running / succeeded / failed
    output: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TaskCreate(BaseModel):
    mode: str
    prompt: str


# --- Helper ---

def datetime_to_iso(dt: datetime) -> str:
    return dt.isoformat()


def doc_to_conversation(doc: dict) -> Conversation:
    for key in ('created_at', 'updated_at'):
        if isinstance(doc.get(key), str):
            doc[key] = datetime.fromisoformat(doc[key])
    return Conversation(**doc)


def doc_to_message(doc: dict) -> Message:
    if isinstance(doc.get('created_at'), str):
        doc['created_at'] = datetime.fromisoformat(doc['created_at'])
    return Message(**doc)


def doc_to_task(doc: dict) -> Task:
    for key in ('created_at', 'updated_at'):
        if isinstance(doc.get(key), str):
            doc[key] = datetime.fromisoformat(doc[key])
    return Task(**doc)


# --- Routes ---

@api_router.get("/")
async def root():
    return {"message": "Hello World"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = datetime_to_iso(doc['timestamp'])
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check.get('timestamp'), str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


@api_router.get("/conversations", response_model=List[Conversation])
async def get_conversations():
    docs = await db.conversations.find({}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return [doc_to_conversation(doc) for doc in docs]


@api_router.post("/conversations", response_model=Conversation)
async def create_conversation():
    conv = Conversation()
    doc = conv.model_dump()
    doc['created_at'] = datetime_to_iso(doc['created_at'])
    doc['updated_at'] = datetime_to_iso(doc['updated_at'])
    await db.conversations.insert_one(doc)
    return conv


@api_router.get("/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    doc = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return doc_to_conversation(doc)


@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    result = await db.conversations.delete_one({"id": conversation_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.messages.delete_many({"conversation_id": conversation_id})
    return {"message": "Conversation deleted"}


@api_router.get("/conversations/{conversation_id}/messages", response_model=List[Message])
async def get_messages(conversation_id: str):
    docs = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return [doc_to_message(doc) for doc in docs]


@api_router.post("/chat")
async def chat(request: ChatRequest):
    conversation_id = request.conversation_id

    # Create a new conversation if none provided
    if not conversation_id:
        conv = Conversation()
        doc = conv.model_dump()
        doc['created_at'] = datetime_to_iso(doc['created_at'])
        doc['updated_at'] = datetime_to_iso(doc['updated_at'])
        await db.conversations.insert_one(doc)
        conversation_id = conv.id

    # Save user message
    user_msg = Message(conversation_id=conversation_id, role="user", content=request.message)
    user_doc = user_msg.model_dump()
    user_doc['created_at'] = datetime_to_iso(user_doc['created_at'])
    await db.messages.insert_one(user_doc)

    # Load conversation history for context
    history = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    messages_for_llm = [{"role": m["role"], "content": m["content"]} for m in history]

    assistant_id = str(uuid.uuid4())

    async def generate():
        full_content: list[str] = []
        try:
            # Send conversation_id so the client knows which conversation this belongs to
            yield f"data: {json.dumps({'type': 'start', 'conversation_id': conversation_id, 'message_id': assistant_id})}\n\n"

            if _use_placeholder_ai:
                # No valid API key — return a demo placeholder response
                placeholder = (
                    "⚠️ **Mode démonstration** — aucune clé API OpenAI configurée.\n\n"
                    "Pour activer le chat IA, ajoutez `OPENAI_API_KEY=sk-...` dans `backend/.env`.\n\n"
                    f"Votre message : *{request.message}*"
                )
                full_content.append(placeholder)
                yield f"data: {json.dumps({'type': 'chunk', 'content': placeholder})}\n\n"
            else:
                stream = await openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages_for_llm,
                    stream=True,
                )

                async for chunk in stream:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        full_content.append(delta)
                        yield f"data: {json.dumps({'type': 'chunk', 'content': delta})}\n\n"

            # Persist assistant message
            full_text = "".join(full_content)
            assistant_msg = Message(
                id=assistant_id,
                conversation_id=conversation_id,
                role="assistant",
                content=full_text,
            )
            a_doc = assistant_msg.model_dump()
            a_doc['created_at'] = datetime_to_iso(a_doc['created_at'])
            await db.messages.insert_one(a_doc)

            # Update conversation title if still default
            conv_doc = await db.conversations.find_one({"id": conversation_id}, {"_id": 0})
            if conv_doc and conv_doc.get("title") == "New Conversation":
                title = request.message[:60] + ("…" if len(request.message) > 60 else "")
                await db.conversations.update_one(
                    {"id": conversation_id},
                    {"$set": {"title": title, "updated_at": datetime_to_iso(datetime.now(timezone.utc))}},
                )
            else:
                # Always update updated_at
                await db.conversations.update_one(
                    {"id": conversation_id},
                    {"$set": {"updated_at": datetime_to_iso(datetime.now(timezone.utc))}},
                )

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            logger.error("Error in chat stream: %s", exc)
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@api_router.post("/tasks", response_model=Task)
async def create_task(body: TaskCreate):
    task = Task(mode=body.mode, prompt=body.prompt)
    doc = task.model_dump()
    doc['created_at'] = datetime_to_iso(doc['created_at'])
    doc['updated_at'] = datetime_to_iso(doc['updated_at'])
    await db.tasks.insert_one(doc)

    # Fire-and-forget generation pipeline; keep a strong reference to avoid GC
    bg_task = asyncio.create_task(_run_task(task.id, body.mode, body.prompt))
    _background_tasks.add(bg_task)
    bg_task.add_done_callback(_background_tasks.discard)
    return task


async def _run_task(task_id: str, mode: str, prompt: str):
    """Generate a structured plan/spec for the requested app using OpenAI."""
    now_iso = datetime_to_iso(datetime.now(timezone.utc))
    await db.tasks.update_one(
        {"id": task_id},
        {"$set": {"status": "running", "updated_at": now_iso}},
    )

    mode_labels = {
        "fullstack": "Application Full Stack",
        "mobile": "Application Mobile",
        "landing": "Page d'atterrissage",
    }
    mode_label = mode_labels.get(mode, mode)

    system_prompt = (
        "You are an expert software architect. "
        "Given a brief description of an application, produce a concise structured plan "
        "in the following JSON format:\n"
        "{\n"
        '  "title": "<short app name>",\n'
        '  "description": "<one-paragraph description>",\n'
        '  "tech_stack": ["<tech1>", "<tech2>", ...],\n'
        '  "features": ["<feature1>", "<feature2>", ...],\n'
        '  "pages": ["<page1>", "<page2>", ...],\n'
        '  "api_endpoints": ["<endpoint1>", "<endpoint2>", ...]\n'
        "}\n"
        "Respond only with the JSON object, no prose."
    )
    user_message = f"Type: {mode_label}\nDescription: {prompt}"

    try:
        if not _use_placeholder_ai:
            response = await openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
            )
            output = response.choices[0].message.content
        else:
            # Placeholder output when no valid API key is configured
            title = prompt[:_PLACEHOLDER_TITLE_MAX_LENGTH]
            if len(prompt) > _PLACEHOLDER_TITLE_MAX_LENGTH:
                title += "…"
            output = json.dumps({
                "title": title,
                "description": f"A {mode_label} application: {prompt}",
                "tech_stack": ["React", "FastAPI", "MongoDB"],
                "features": ["User authentication", "Dashboard", "REST API"],
                "pages": ["Home", "Dashboard", "Settings"],
                "api_endpoints": ["GET /api/items", "POST /api/items"],
            }, ensure_ascii=False)

        now_iso = datetime_to_iso(datetime.now(timezone.utc))
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"status": "succeeded", "output": output, "updated_at": now_iso}},
        )
    except Exception as exc:
        logger.error("Task generation error for %s: %s", task_id, exc)
        now_iso = datetime_to_iso(datetime.now(timezone.utc))
        await db.tasks.update_one(
            {"id": task_id},
            {"$set": {"status": "failed", "output": str(exc), "updated_at": now_iso}},
        )


@api_router.get("/tasks", response_model=List[Task])
async def list_tasks():
    docs = await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [doc_to_task(doc) for doc in docs]


@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str):
    doc = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Task not found")
    return doc_to_task(doc)


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}


# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

