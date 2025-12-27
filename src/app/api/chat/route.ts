import { streamText, convertToModelMessages } from "ai";
import { z } from "zod";
import { createSiliconFlowProvider } from "@/lib/siliconflow";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;

function decryptApiKeyServer(encoded: string): string | null {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");

    if (decoded && decoded.length > 10) {
      if (/^[\x20-\x7E]+$/.test(decoded)) {
        return decoded;
      }
    }

    if (encoded.startsWith("sk-")) {
      return encoded;
    }

    return encoded;
  } catch (e) {
    return encoded;
  }
}

function errorHandler(error: unknown): string {
  if (error == null) {
    return "unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("api key") || message.includes("unauthorized") || message.includes("401")) {
      return "API Key 无效或已过期，请检查 API Key 设置";
    }

    if (message.includes("model") || message.includes("404")) {
      return "所选模型不可用，请尝试切换其他模型";
    }

    if (message.includes("rate limit") || message.includes("429")) {
      return "请求过于频繁，请稍后再试";
    }

    if (message.includes("timeout") || message.includes("timed out")) {
      return "请求超时，图表可能过于复杂，请尝试简化需求";
    }

    if (message.includes("token") || message.includes("context length")) {
      return "内容过长，请尝试简化描述或分步生成";
    }

    return error.message;
  }

  return JSON.stringify(error);
}

export async function POST(req: Request) {
  try {
    const encodedApiKey = req.headers.get("X-Encrypted-Api-Key");
    const modelId = req.headers.get("X-Model-Id") || "Qwen/Qwen2.5-72B-Instruct";
    const debugToolCalls =
      req.headers.get("X-Debug-Tool-Calls") === "1" || process.env.SILICONFLOW_DEBUG_TOOL_CALLS === "1";

    if (!encodedApiKey) {
      return Response.json({ error: "Missing SiliconFlow API Key" }, { status: 401 });
    }

    const apiKey = decryptApiKeyServer(encodedApiKey);
    if (!apiKey) {
      return Response.json({ error: "Invalid API Key" }, { status: 401 });
    }

    const { messages, xml } = await req.json();

    const provider = createSiliconFlowProvider(apiKey, { debugToolCalls });
    const model = provider(modelId);

    const lastMessage = messages[messages.length - 1];
    const textPart = lastMessage.parts?.find((p: any) => p.type === "text");
    const lastMessageText = textPart?.text || lastMessage.content || "";

    const editKeywords = ['修改', '编辑', '调整', '改', '换', '更新', '删除', '移动', '添加到'];
    const isEditRequest = editKeywords.some(keyword => lastMessageText.includes(keyword));

    const formattedTextContent =
      (xml && xml.trim() && isEditRequest)
        ? `当前图表 XML（仅显示关键结构）:\n\`\`\`xml\n${xml.slice(0, 3000)}\n...\n\`\`\`\n\n用户请求: ${lastMessageText}`
        : lastMessageText;

    const modelMessages = convertToModelMessages(messages);

    let enhancedMessages = modelMessages.filter(
      (msg: any) => msg.content && Array.isArray(msg.content) && msg.content.length > 0
    );

    if (enhancedMessages.length >= 1) {
      const lastModelMessage = enhancedMessages[enhancedMessages.length - 1];
      if (lastModelMessage.role === "user") {
        const contentParts: any[] = [{ type: "text", text: formattedTextContent }];

        enhancedMessages = [
          ...enhancedMessages.slice(0, -1),
          { ...lastModelMessage, content: contentParts },
        ];
      }
    }

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: enhancedMessages,
      maxOutputTokens: 16384,
      tools: {
        display_diagram: {
          description:
            "在 draw.io 中展示一个全新的图表。传入 <root> 标签内的完整 XML 内容。",
          inputSchema: z.object({
            xml: z.string().describe("draw.io XML 格式的图表内容，必须包含 <root> 标签"),
          }),
        },
        edit_diagram: {
          description:
            "编辑现有图表的指定部分。通过查找替换的方式修改 XML 中的特定内容。适用于小范围修改。",
          inputSchema: z.object({
            edits: z
              .array(
                z.object({
                  search: z.string().describe("要查找的原始 XML 片段"),
                  replace: z.string().describe("替换后的 XML 片段"),
                })
              )
              .describe("查找替换操作列表，按顺序执行"),
          }),
        },
      },
      temperature: 0.35,
    });

    return result.toUIMessageStreamResponse({
      onError: errorHandler,
    });
  } catch (error) {
    const causeData = (error as any)?.cause?.data;
    if (causeData) {
      console.error("[/api/chat] Invalid response data from provider:", causeData);
      if ((causeData as any)?.function) {
        console.error("[/api/chat] Invalid response data function:", (causeData as any).function);
      }
    }

    return Response.json(
      {
        error: errorHandler(error),
        details: error instanceof Error ? error.message : "Internal server error"
      },
      { status: 500 }
    );
  }
}
