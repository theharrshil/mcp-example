import "dotenv/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { confirm, input, select } from "@inquirer/prompts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CreateMessageRequestSchema,
  Prompt,
  PromptMessage,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { generateText, jsonSchema, ToolSet } from "ai";

const mcpClient = new Client(
  {
    name: "text-client-video",
    version: "1.0.0",
  },
  { capabilities: { sampling: {} } }
);

const clientTransport = new StdioClientTransport({
  command: "node",
  args: ["build/server.js"],
  stderr: "ignore",
});

const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Main function that initializes the MCP client and presents an interactive menu for users
async function main() {
  await mcpClient.connect(clientTransport);
  const [{ tools }, { prompts }, { resources }, { resourceTemplates }] = await Promise.all([
    mcpClient.listTools(),
    mcpClient.listPrompts(),
    mcpClient.listResources(),
    mcpClient.listResourceTemplates(),
  ]);

  mcpClient.setRequestHandler(CreateMessageRequestSchema, async (request) => {
    const generatedTexts: string[] = [];
    for (const message of request.params.messages) {
      const generatedText = await handleServerMessagePrompt(message);
      if (generatedText != null) generatedTexts.push(generatedText);
    }

    return {
      role: "user",
      model: "gemini-2.0-flash",
      stopReason: "endTurn",
      content: {
        type: "text",
        text: generatedTexts.join("\n"),
      },
    };
  });

  console.log("You are connected!");
  while (true) {
    const selectedOption = await select({
      message: "What would you like to do",
      choices: ["Query", "Tools", "Resources", "Prompts"],
    });

    switch (selectedOption) {
      case "Tools":
        const selectedToolName = await select({
          message: "Select a tool",
          choices: tools.map((tool) => ({
            name: tool.annotations?.title || tool.name,
            value: tool.name,
            description: tool.description,
          })),
        });
        const selectedTool = tools.find((tool) => tool.name === selectedToolName);
        if (selectedTool == null) {
          console.error("Tool not found.");
        } else {
          await handleTool(selectedTool);
        }
        break;
      case "Resources":
        const selectedResourceUri = await select({
          message: "Select a resource",
          choices: [
            ...resources.map((resource) => ({
              name: resource.name,
              value: resource.uri,
              description: resource.description,
            })),
            ...resourceTemplates.map((template) => ({
              name: template.name,
              value: template.uriTemplate,
              description: template.description,
            })),
          ],
        });
        const resolvedUri =
          resources.find((resource) => resource.uri === selectedResourceUri)?.uri ??
          resourceTemplates.find((template) => template.uriTemplate === selectedResourceUri)
            ?.uriTemplate;
        if (resolvedUri == null) {
          console.error("Resource not found.");
        } else {
          await handleResource(resolvedUri);
        }
        break;
      case "Prompts":
        const selectedPromptName = await select({
          message: "Select a prompt",
          choices: prompts.map((prompt) => ({
            name: prompt.name,
            value: prompt.name,
            description: prompt.description,
          })),
        });
        const selectedPrompt = prompts.find((prompt) => prompt.name === selectedPromptName);
        if (selectedPrompt == null) {
          console.error("Prompt not found.");
        } else {
          await handlePrompt(selectedPrompt);
        }
        break;
      case "Query":
        await handleQuery(tools);
      case "Autonomous Task":
        await handleAutonomousTask(tools);
        break;
    }
  }
}

// Handles user queries by generating AI responses with access to available MCP tools
async function handleQuery(availableTools: Tool[]) {
  const userQuery = await input({ message: "Enter your query" });

  const { text, toolResults } = await generateText({
    model: googleAI("gemini-2.0-flash"),
    prompt: userQuery,
    tools: availableTools.reduce(
      (toolsObject, tool) => ({
        ...toolsObject,
        [tool.name]: {
          description: tool.description,
          parameters: jsonSchema(tool.inputSchema),
          execute: async (toolArguments: Record<string, any>) => {
            return await mcpClient.callTool({
              name: tool.name,
              arguments: toolArguments,
            });
          },
        },
      }),
      {} as ToolSet
    ),
  });

  console.log(
    // @ts-expect-error
    text || toolResults[0]?.result?.content[0]?.text || "No text generated."
  );
}

// Handles the execution of a selected MCP tool by collecting input arguments and calling the tool
async function handleTool(tool: Tool) {
  const toolArguments: Record<string, string> = {};
  for (const [propertyKey, propertyValue] of Object.entries(tool.inputSchema.properties ?? {})) {
    toolArguments[propertyKey] = await input({
      message: `Enter value for ${propertyKey} (${(propertyValue as { type: string }).type}):`,
    });
  }

  const toolResponse = await mcpClient.callTool({
    name: tool.name,
    arguments: toolArguments,
  });

  console.log((toolResponse.content as [{ text: string }])[0].text);
}

// Handles resource retrieval by constructing the URI with user-provided parameters
async function handleResource(resourceUri: string) {
  let constructedUri = resourceUri;
  const parameterMatches = resourceUri.match(/{([^}]+)}/g);

  if (parameterMatches != null) {
    for (const parameterMatch of parameterMatches) {
      const parameterName = parameterMatch.replace("{", "").replace("}", "");
      const parameterValue = await input({
        message: `Enter value for ${parameterName}:`,
      });
      constructedUri = constructedUri.replace(parameterMatch, parameterValue);
    }
  }

  const resourceResponse = await mcpClient.readResource({
    uri: constructedUri,
  });

  console.log(JSON.stringify(JSON.parse(resourceResponse.contents[0].text as string), null, 2));
}

// Handles prompt execution by collecting arguments and displaying the generated prompt messages
async function handlePrompt(prompt: Prompt) {
  const promptArguments: Record<string, string> = {};
  for (const argument of prompt.arguments ?? []) {
    promptArguments[argument.name] = await input({
      message: `Enter value for ${argument.name}:`,
    });
  }

  const promptResponse = await mcpClient.getPrompt({
    name: prompt.name,
    arguments: promptArguments,
  });

  for (const message of promptResponse.messages) {
    console.log(await handleServerMessagePrompt(message));
  }
}

// Handles server message prompts by displaying them and optionally running them through the AI model
async function handleServerMessagePrompt(message: PromptMessage) {
  if (message.content.type !== "text") return;

  console.log(message.content.text);
  const shouldRunPrompt = await confirm({
    message: "Would you like to run the above prompt",
    default: true,
  });

  if (!shouldRunPrompt) return;

  const { text } = await generateText({
    model: googleAI("gemini-2.0-flash"),
    prompt: message.content.text,
  });

  return text;
}

// Handles an autonomous task
async function handleAutonomousTask(availableTools: Tool[]) {
  const taskDescription = await input({
    message: "Describe a task (e.g., 'Create 3 users with different backgrounds'):",
  });

  console.log("\n🤖 Agent working autonomously...\n");

  const { text, toolResults } = await generateText({
    model: googleAI("gemini-2.0-flash"),
    prompt: `Complete this task: ${taskDescription}. Use the available tools as needed.`,
    tools: availableTools.reduce(
      (toolsObject, tool) => ({
        ...toolsObject,
        [tool.name]: {
          description: tool.description,
          parameters: jsonSchema(tool.inputSchema),
          execute: async (toolArguments: Record<string, any>) => {
            console.log(`  ↳ Calling tool: ${tool.name}`);
            return await mcpClient.callTool({
              name: tool.name,
              arguments: toolArguments,
            });
          },
        },
      }),
      {} as ToolSet
    ),
    maxSteps: 5, // Allow multiple tool calls
  });

  console.log("\n✅ Task completed!");
  console.log(text);
}

main();
