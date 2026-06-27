import os
import traceback
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from azure.identity import DefaultAzureCredential
from azure.cosmos import CosmosClient
from typing import Optional
from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from app.database import add_todo_item, search_todo_items, delete_todo_item
from datetime import datetime

app = FastAPI(title="Foundry Model Backend")

# Enable CORS for local development
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://gray-flower-09c2eab0f.7.azurestaticapps.net"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Native Cosmos SDK Clients directly for fast API endpoints
COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT")
DATABASE_NAME = os.getenv("COSMOS_DATABASE")
CONTAINER_NAME = os.getenv("COSMOS_CONTAINER")
if COSMOS_ENDPOINT and DATABASE_NAME and CONTAINER_NAME:
    print("All env variables were set successfully")

credential = DefaultAzureCredential()
client = CosmosClient(url=COSMOS_ENDPOINT, credential=credential)
database = client.get_database_client(DATABASE_NAME)
container = database.get_container_client(CONTAINER_NAME)

class AgentChatRequest(BaseModel):
    message: str


# ==================== NATIVE COSMOS SDK GET ENDPOINT ====================
@app.get("/api/todos")
def get_all_todos():
    """
    Directly queries Cosmos DB via the native SDK proxy, bypassing the tool wrappers.
    """
    try:
        # Use direct SDK cross-partition query execution
        query = "SELECT * FROM c"
        db_tasks = list(container.query_items(query=query, enable_cross_partition_query=True))
        
        if not db_tasks:
            return {"todos": []}
            
        formatted_todos = []
        for index, task in enumerate(db_tasks):
            # Fallback safely to todo_date if created_at doesn't exist for older items
            timestamp = task.get("created_at") or task.get("todo_date", "")
            
            if isinstance(task, dict):
                formatted_todos.append({
                    "id": str(task.get("id", f"task-{index}")),
                    "title": task.get("description", "Untitled Task"),
                    "status": "Completed" if task.get("is_accomplished") is True else "In Progress",
                    "time": task.get("todo_date", ""),
                    "timestamp": timestamp,  # 🚀 Pass the high-precision timestamp down
                    "icon": "check_circle" if task.get("is_accomplished") is True else "sync"
                })
            
        # 🚀 Sort by the timestamp string in descending order (newest first)
        formatted_todos.sort(key=lambda x: x["timestamp"], reverse=True)
        return {"todos": formatted_todos}
        
    except Exception as e:
        print("--- NATIVE COSMOS DATA FETCH ERROR ---")
        traceback.print_exc()
        print("---------------------------------------")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tasks from Cosmos: {str(e)}")


# ==================== AGENT CHAT ENDPOINT ====================
@app.post("/api/chat")
async def chat_with_agent(payload: AgentChatRequest):
    try:
        # 🚀 Dynamically extract the live system date on every request
        current_date_str = datetime.now().strftime("%Y-%m-%d")

        # 🚀 Mix the active system calendar date straight into the prompt layer
        dynamic_instructions = (
            f"You are a helpful productivity assistant managing a Cosmos DB to-do list.\n"
            f"CRITICAL SYSTEM CONTEXT: Today's current date is exactly {current_date_str}.\n\n"
            
            "⚠️ SCHEMA MAPPING RULE:\n"
            "In this application, the terms 'task', 'title', and 'todo' all correspond directly to "
            "the `description` attribute in the database. When a user mentions a 'task', you must map "
            "it to the `description` field when using your tools.\n\n"
            
            "⛔ CRITICAL OPERATIONAL RULE FOR DELETION:\n"
            "You cannot delete an item using just its description. Cosmos DB requires both the unique structural "
            "UUID string ('id') AND the exact partition key ('todo_date') to remove a document.\n"
            "Therefore, if a user asks you to delete or remove a task, you MUST follow these exact steps:\n"
            "1. First, call `search_todo_items` passing the user's task text into the `description` parameter.\n"
            "2. Read the search results to extract the real string 'id' and the matching 'todo_date'.\n"
            "3. Only after receiving that metadata, call `delete_todo_item` with those exact parameters.\n\n"
            
            "Core Capabilities:\n"
            "1. Use `add_todo_item` to create new tasks.\n"
            "2. Use `search_todo_items` to find tasks.\n"
            "3. Use `delete_todo_item` to remove tasks using their unique string ID.\n"
        )

        agent = Agent(
            client=FoundryChatClient(credential=DefaultAzureCredential()),
            instructions=dynamic_instructions,  # 👈 Fed into the agent instance here
            tools=[add_todo_item, search_todo_items, delete_todo_item],
        )

        result = await agent.run(payload.message)
        return {"response": result.text}

    except Exception as e:
        print("--- CRITICAL AGENT ERROR STACK TRACE ---")
        traceback.print_exc()
        print("-----------------------------------------")
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")