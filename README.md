# MCP Server & Client Example

A practical example of building a Model Context Protocol (MCP) server and client that manages user data with AI-powered features.

## What's This About?

This project demonstrates how to build an MCP server that exposes resources, tools, and prompts, along with a client that interacts with them using Google's Gemini AI. Think of it as a bridge between AI models and your application logic.

## Project Structure

### Server (`server.ts`)

The server exposes three main capabilities:

**Resources** - Read-only data endpoints

- `users://all` - Get all users from the database
- `users://{userId}/profile` - Get a specific user's profile

**Tools** - Actions the AI can perform

- `create-user` - Create a new user with provided details
- `create-random-user` - Generate and create a user with AI-generated fake data

**Prompts** - Templates for AI interactions

- `generate-fake-user` - Template to generate fake user data based on a name

### Client (`client.ts`)

An interactive CLI that lets you:

- **Query** - Ask questions and let the AI use tools to help
- **Tools** - Manually execute server tools
- **Resources** - Browse and fetch resource data
- **Prompts** - Run prompt templates

## Getting Started

### Prerequisites

- Node.js installed
- A Google Gemini API key

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file:

```bash
GEMINI_API_KEY=your_api_key_here
```

### Running

Start the client (it will automatically connect to the server):

```bash
npm run server:inspect
```

## How It Works

The magic happens through the Model Context Protocol:

1. **Server** registers resources, tools, and prompts
2. **Client** connects via stdio transport
3. **AI Model** (Gemini) can call tools to perform actions
4. **You** interact through a friendly CLI menu

When you ask a question, the AI can intelligently decide which tools to use. For example, asking "create a user named John" might trigger the `create-user` tool automatically.

## Example Interactions

**Creating a user manually:**

```
Select "Tools" → "Create User" → Enter details
```

**AI-powered query:**

```
Select "Query" → "Create 3 random users for me"
```

The AI will call `create-random-user` three times for you!

**Fetching data:**

```
Select "Resources" → "Users" → See all users
```

## Tech Stack

- **MCP SDK** - Model Context Protocol implementation
- **Google AI SDK** - Gemini integration
- **Inquirer** - Interactive CLI prompts
- **Zod** - Schema validation
- **TypeScript** - Type safety

## The Cool Part

The server can request the AI to generate content (like fake user data) through the `sampling/createMessage` endpoint. This creates a neat loop where your server can leverage AI capabilities on-demand.

## Note

This is a learning example. In production, you'd want:

- Proper database instead of JSON file
- Error handling and validation
- Authentication and authorization
- Rate limiting
# mcp-example
