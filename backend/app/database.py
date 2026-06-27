import os
import asyncio
import uuid
from typing import Annotated, Optional
from dotenv import load_dotenv
from azure.identity import AzureCliCredential
from pydantic import Field
from datetime import datetime  

# Import the official Azure Cosmos DB library
from azure.cosmos import CosmosClient, PartitionKey, exceptions

# Assuming your SDK framework imports
from agent_framework import Agent, tool
from agent_framework.foundry import FoundryChatClient

# 1. Load credentials
load_dotenv()

COSMOS_ENDPOINT = os.environ.get("COSMOS_ENDPOINT")
COSMOS_KEY = os.environ.get("COSMOS_KEY")
COSMOS_DATABASE = os.environ.get("COSMOS_DATABASE", "todo_database")
COSMOS_CONTAINER = os.environ.get("COSMOS_CONTAINER", "todos")

# 2. Initialize the Cosmos Client and Container
client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
database = client.get_database_client(COSMOS_DATABASE)
# Cosmos DB partitions by logical boundary; we'll use '/todo_date' as the partition key
container = database.get_container_client(COSMOS_CONTAINER)


@tool(approval_mode="never_require")
def add_todo_item(
    description: Annotated[str, Field(description="A text description of the task/to-do item.")], 
    todo_date: Annotated[str, Field(description="The date for the task in 'YYYY-MM-DD' string format")], 
    is_accomplished: Annotated[bool, Field(description="Boolean indicating if the task is already completed. Defaults to False.")]
) -> str:
    """Adds a new to-do document to the Cosmos DB NoSQL container."""
    
    # Construct a JSON document mapping
    todo_document = {
        "id": str(uuid.uuid4()),  # Partition Key
        "todo_date": todo_date,   
        "created_at": datetime.now().isoformat(),  # 🚀 ADD THIS: e.g., "2026-06-27T11:15:21.37966"
        "description": description,
        "is_accomplished": is_accomplished,   
    }
    
    try:
        container.create_item(body=todo_document)
        return f"Successfully added task: '{description}' scheduled for {todo_date}."
    except Exception as e:
        return f"Failed to add to-do item due to error: {str(e)}"


@tool(approval_mode="never_require")
def search_todo_items(
    description: Optional[str] = None, 
    todo_date: Optional[str] = None, 
    is_accomplished: Optional[bool] = None
) -> str:
    """Searches and retrieves documents from Cosmos DB using NoSQL parameterized syntax."""
    
    # Base parameterized query structure
    query = "SELECT c.id, c.todo_date, c.description, c.is_accomplished FROM c"
    conditions = []
    parameters = []
    
    # Dynamically build the WHERE conditions using Cosmos SQL parameters
    if description is not None:
        conditions.append("CONTAINS(LOWER(c.description), LOWER(@description))")
        parameters.append({"name": "@description", "value": description})
        
    if todo_date is not None:
        conditions.append("c.todo_date = @todo_date")
        parameters.append({"name": "@todo_date", "value": todo_date})
        
    if is_accomplished is not None:
        conditions.append("c.is_accomplished = @is_accomplished")
        parameters.append({"name": "@is_accomplished", "value": is_accomplished})
        
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
        
    query += " ORDER BY c.todo_date ASC"

    try:
        # Execute query against Cosmos DB
        items = list(container.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True
        ))
        
        if not items:
            return "No matching tasks found in the database."
            
        result_lines = ["Here are the tasks I found:"]
        for doc in items:
            status = "✅ Done" if doc.get("is_accomplished") else "⏳ Pending"
            # Return the unique item string ID alongside descriptions
            result_lines.append(f"ID: {doc.get('id')} | [{doc.get('todo_date')}] {doc.get('description')} ({status})")
            
        return "\n".join(result_lines)
        
    except Exception as e:
        return f"Failed to search database due to error: {str(e)}"


@tool(approval_mode="never_require")
def delete_todo_item(
    todo_id: Annotated[str, Field(description="The unique string ID of the database item to delete.")],
    todo_date: Annotated[str, Field(description="The 'YYYY-MM-DD' date string associated with the item.")]
) -> str:
    """Permanently deletes a specific to-do document using its unique ID."""
    try:
        # 🚀 FIX: Pass todo_id as the partition key if the portal defines the partition key as /id
        container.delete_item(item=todo_id, partition_key=todo_id) 
        return f"Successfully deleted task with ID {todo_id}."
        
    except exceptions.CosmosResourceNotFoundError:
        return f"No task found with ID {todo_id}. Nothing was deleted."
    except Exception as e:
        return f"Failed to delete item due to error: {str(e)}"

