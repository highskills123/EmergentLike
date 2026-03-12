from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
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

# OpenAI client
openai_client = AsyncOpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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


# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

