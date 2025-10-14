import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";

const mcpServer = new McpServer({
  name: "mcp-server-example",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
    prompts: {},
  },
});

// Resource handler that retrieves all users from the database
mcpServer.resource(
  "users",
  "users://all",
  {
    description: "Get all users data from the database",
    title: "Users",
    mimeType: "application/json",
  },
  async (resourceUri) => {
    const allUsers = await import("./data/users.json", {
      with: { type: "json" },
    }).then((module) => module.default);

    return {
      contents: [
        {
          uri: resourceUri.href,
          text: JSON.stringify(allUsers),
          mimeType: "application/json",
        },
      ],
    };
  }
);

// Resource handler that retrieves a specific user's profile details by user ID
mcpServer.resource(
  "user-details",
  new ResourceTemplate("users://{userId}/profile", { list: undefined }),
  {
    description: "Get a user's details from the database",
    title: "User Details",
    mimeType: "application/json",
  },
  async (resourceUri, { userId }) => {
    const allUsers = await import("./data/users.json", {
      with: { type: "json" },
    }).then((module) => module.default);
    const foundUser = allUsers.find((user) => user.id === parseInt(userId as string));

    if (foundUser == null) {
      return {
        contents: [
          {
            uri: resourceUri.href,
            text: JSON.stringify({ error: "User not found" }),
            mimeType: "application/json",
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: resourceUri.href,
          text: JSON.stringify(foundUser),
          mimeType: "application/json",
        },
      ],
    };
  }
);

// Tool that creates a new user in the database with provided user data
mcpServer.tool(
  "create-user",
  "Create a new user in the database",
  {
    name: z.string(),
    email: z.string(),
    address: z.string(),
    phone: z.string(),
  },
  {
    title: "Create User",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (userParams) => {
    try {
      const newUserId = await createUser(userParams);

      return {
        content: [{ type: "text", text: `User ${newUserId} created successfully` }],
      };
    } catch {
      return {
        content: [{ type: "text", text: "Failed to save user" }],
      };
    }
  }
);

// Tool that generates and creates a random user with AI-generated fake data
mcpServer.tool(
  "create-random-user",
  "Create a random user with fake data",
  {
    title: "Create Random User",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async () => {
    const aiResponse = await mcpServer.server.request(
      {
        method: "sampling/createMessage",
        params: {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "Generate fake user data. The user should have a realistic name, email, address, and phone number. Return this data as a JSON object with no other text or formatter so it can be used with JSON.parse.",
              },
            },
          ],
          maxTokens: 1024,
        },
      },
      CreateMessageResultSchema
    );

    if (aiResponse.content.type !== "text") {
      return {
        content: [{ type: "text", text: "Failed to generate user data" }],
      };
    }

    try {
      const generatedUserData = JSON.parse(
        aiResponse.content.text
          .trim()
          .replace(/^```json/, "")
          .replace(/```$/, "")
          .trim()
      );

      const newUserId = await createUser(generatedUserData);
      return {
        content: [{ type: "text", text: `User ${newUserId} created successfully` }],
      };
    } catch {
      return {
        content: [{ type: "text", text: "Failed to generate user data" }],
      };
    }
  }
);

// Prompt template that generates a fake user profile based on a provided name
mcpServer.prompt(
  "generate-fake-user",
  "Generate a fake user based on a given name",
  {
    name: z.string(),
  },
  ({ name }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate a fake user with the name ${name}. The user should have a realistic email, address, and phone number.`,
          },
        },
      ],
    };
  }
);

// Helper function that adds a new user to the database and returns the new user's ID
async function createUser(userData: {
  name: string;
  email: string;
  address: string;
  phone: string;
}) {
  const allUsers = await import("./data/users.json", {
    with: { type: "json" },
  }).then((module) => module.default);

  const newUserId = allUsers.length + 1;

  allUsers.push({ id: newUserId, ...userData });

  await fs.writeFile("./src/data/users.json", JSON.stringify(allUsers, null, 2));

  return newUserId;
}

// Main function that initializes and starts the MCP server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main();
