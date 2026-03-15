from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import json
import uuid
from typing import Optional

# Your compiled LangGraph app
from blog_writer1 import app as langgraph_app

# ==================== Pydantic Models ====================

class GenerateRequest(BaseModel):
    topic: str

class FeedbackRequest(BaseModel):
    feedback: str

# ==================== FastAPI Setup ====================

fastapi_app = FastAPI()

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DONE_EVENT = json.dumps({"type": "done"})


# ==================== Streaming Logic ====================

async def stream_graph_updates(thread_id: str, initial_state: Optional[dict] = None):
    """
    Streams LangGraph updates as Server-Sent Events (SSE)
    """
    queue = asyncio.Queue()
    config = {"configurable": {"thread_id": thread_id}}

    async def queue_update(update: dict):
        for node_name, output in update.items():
            print(f"📦 NODE EXECUTED: {node_name}")

            # ✅ Match both main worker and subgraph worker
            if node_name.endswith("worker") and "sections" in output:
                for task_id, section_md in output["sections"]:
                    print(f"✅ WORKER produced section for task {task_id}")
                    await queue.put(
                        json.dumps({
                            "type": "section",
                            "content": section_md,
                        })
                    )

            if node_name == "edit_subgraph":
                print("✏️ EDIT_SUBGRAPH executed")
                await queue.put(
                    json.dumps({
                        "type": "info",
                        "message": "Applying feedback..."
                    })
                )
            
    loop = asyncio.get_running_loop()

    def run_graph_sync():
        try:
            if initial_state is not None:
                stream = langgraph_app.stream(
                    initial_state,
                    config=config,
                    stream_mode="updates",
                )
            else:
                stream = langgraph_app.stream(
                    {},   # NOT None
                    config=config,
                    stream_mode="updates",
                )

            for update in stream:
                asyncio.run_coroutine_threadsafe(
                    queue_update(update),
                    loop,
                ).result()

        except Exception as e:
            import traceback
            traceback.print_exc()

            asyncio.run_coroutine_threadsafe(
                queue.put(json.dumps({
                    "type": "error",
                    "message": str(e)
                })),
                loop,
            ).result()

        finally:
            print("🏁 Graph finished, sending DONE_EVENT")
            asyncio.run_coroutine_threadsafe(
                queue.put(DONE_EVENT),
                loop,
            ).result()
        

    task = loop.run_in_executor(None, run_graph_sync)

    try:
        while True:
            try:
                data = await asyncio.wait_for(queue.get(), timeout=20)
                yield f"data: {data}\n\n"

                if data == DONE_EVENT:
                    break

            except asyncio.TimeoutError:
                # keep connection alive
                yield ":\n\n"

    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


# ==================== API ENDPOINTS ====================

@fastapi_app.post("/generate")
async def generate_blog(request: GenerateRequest):

    thread_id = str(uuid.uuid4())

    initial_state = {
        "topic": request.topic,
        "mode": "",
        "needs_research": False,
        "queries": [],
        "evidence": [],
        "plan": None,
        "sections": [],
        "merged_md": "",
        "final": "",
        "user_request": None,
        "edit_mode": False,
        "original_plan": None,
        "edit_instruction": None,
    }

    async def stream_with_thread_id():
        yield f"data: {json.dumps({'type': 'thread_id', 'thread_id': thread_id})}\n\n"
        async for event in stream_graph_updates(thread_id, initial_state):
            yield event

    return StreamingResponse(
        stream_with_thread_id(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
    
@fastapi_app.middleware("http")
async def log_requests(request, call_next):
    print(f"➡️ Request: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"⬅️ Response: {response.status_code}")
    return response


@fastapi_app.post("/feedback/{thread_id}")
async def send_feedback(thread_id: str, request: FeedbackRequest):
    try:
        config = {"configurable": {"thread_id": thread_id}}

        # 1️⃣ Get current state synchronously in a thread
        state = await asyncio.to_thread(langgraph_app.get_state, config)
        if not state or not state.values:
            raise HTTPException(status_code=404, detail="Thread not found")

        print("====== FEEDBACK RECEIVED ======")
        print("Thread:", thread_id)
        print("Feedback:", request.feedback)

        # 2️⃣ Update state synchronously in a thread
        await asyncio.to_thread(
            langgraph_app.update_state,
            config,
            {
                "user_request": request.feedback,
                "edit_mode": True,
            }
        )

        # 3️⃣ Stream the resumed graph execution (synchronous .stream inside thread already handled)
        async def stream_with_thread_id():
            yield f"data: {json.dumps({'type': 'thread_id', 'thread_id': thread_id})}\n\n"
            async for event in stream_graph_updates(thread_id):
                yield event

        return StreamingResponse(
            stream_with_thread_id(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
    

@fastapi_app.get("/thread/{thread_id}")
async def get_thread_state(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}

    state = await langgraph_app.aget_state(config)

    if not state or not state.values:
        raise HTTPException(status_code=404, detail="Thread not found")

    return {
        "final": state.values.get("final", ""),
        "is_interrupted": state.next == ["wait_for_feedback"],
    }
    
print("=== Registered Routes ===")
for route in fastapi_app.routes:
    print(f"{route.path} {route.methods}")
print("=== End of Routes ===")