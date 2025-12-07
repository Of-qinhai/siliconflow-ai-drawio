import { streamText, convertToModelMessages } from "ai";
import { z } from "zod";
import { createSiliconFlowProvider } from "@/lib/siliconflow";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;

/**
 * 服务端解密 API Key (Base64 解码)
 */
function decryptApiKeyServer(encoded: string): string | null {
  console.log("[Decrypt] Input length:", encoded.length);
  console.log("[Decrypt] Input preview:", encoded.slice(0, 20) + "...");

  try {
    // 直接 Base64 解码
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    console.log("[Decrypt] Decoded length:", decoded.length);
    console.log("[Decrypt] Decoded preview:", decoded.slice(0, 10) + "...");

    // 验证解码后的结果看起来像 API Key
    if (decoded && decoded.length > 10) {
      // 检查是否是有效的 UTF-8 字符串
      if (/^[\x20-\x7E]+$/.test(decoded)) {
        console.log("[Decrypt] Valid ASCII string");
        return decoded;
      } else {
        console.log("[Decrypt] Contains non-ASCII characters, might be wrong encoding");
      }
    }

    // 如果解码结果不像 API Key，可能是直接传的 API Key
    if (encoded.startsWith("sk-")) {
      console.log("[Decrypt] Input looks like raw API key");
      return encoded;
    }

    // 返回原值让 API 调用报错
    console.log("[Decrypt] Falling back to raw input");
    return encoded;
  } catch (e) {
    console.error("[Decrypt] Error:", e);
    return encoded;
  }
}

// 错误处理函数 - 增强版，提供更友好的错误提示
function errorHandler(error: unknown): string {
  if (error == null) {
    return "unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // API Key 相关错误
    if (message.includes("api key") || message.includes("unauthorized") || message.includes("401")) {
      return "API Key 无效或已过期，请检查 API Key 设置";
    }

    // 模型相关错误
    if (message.includes("model") || message.includes("404")) {
      return "所选模型不可用，请尝试切换其他模型";
    }

    // 限流错误
    if (message.includes("rate limit") || message.includes("429")) {
      return "请求过于频繁，请稍后再试";
    }

    // 超时错误
    if (message.includes("timeout") || message.includes("timed out")) {
      return "请求超时，图表可能过于复杂，请尝试简化需求";
    }

    // Token 限制错误
    if (message.includes("token") || message.includes("context length")) {
      return "内容过长，请尝试简化描述或分步生成";
    }

    return error.message;
  }

  return JSON.stringify(error);
}

export async function POST(req: Request) {
  console.log("\n========== [Chat API] New Request ==========");

  try {
    // 从请求头获取编码的 API Key 和模型 ID
    const encodedApiKey = req.headers.get("X-Encrypted-Api-Key");
    const modelId = req.headers.get("X-Model-Id") || "Qwen/Qwen2.5-72B-Instruct";

    console.log("[Chat API] All headers:");
    const headersObj: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      if (key.toLowerCase().startsWith('x-')) {
        headersObj[key] = value;
      }
    });
    console.log(JSON.stringify(headersObj, null, 2));

    console.log("[Chat API] Model:", modelId);
    console.log("[Chat API] Encoded API Key received:", !!encodedApiKey);
    console.log("[Chat API] Encoded API Key length:", encodedApiKey?.length || 0);
    console.log("[Chat API] Encoded API Key preview:", encodedApiKey?.slice(0, 20) + "...");

    if (!encodedApiKey) {
      console.log("[Chat API] ERROR: Missing API Key header");
      return Response.json({ error: "Missing SiliconFlow API Key" }, { status: 401 });
    }

    // 解码 API Key
    const apiKey = decryptApiKeyServer(encodedApiKey);
    if (!apiKey) {
      console.log("[Chat API] ERROR: Failed to decrypt API Key");
      return Response.json({ error: "Invalid API Key" }, { status: 401 });
    }

    console.log("[Chat API] Decrypted API Key starts with:", apiKey.slice(0, 5));
    console.log("[Chat API] API Key length:", apiKey.length);

    const { messages, xml } = await req.json();
    console.log("[Chat API] Messages count:", messages.length);
    console.log("[Chat API] Has existing XML:", !!xml);

    // 创建 SiliconFlow provider
    const provider = createSiliconFlowProvider(apiKey);
    const model = provider(modelId);

    // 获取最后一条用户消息的文本
    const lastMessage = messages[messages.length - 1];
    const textPart = lastMessage.parts?.find((p: any) => p.type === "text");
    const lastMessageText = textPart?.text || lastMessage.content || "";

    // 智能判断是否需要包含当前图表 XML
    // 只在编辑/修改操作时包含，避免上下文过长
    const editKeywords = ['修改', '编辑', '调整', '改', '换', '更新', '删除', '移动', '添加到'];
    const isEditRequest = editKeywords.some(keyword => lastMessageText.includes(keyword));

    // 构造增强的内容（只在编辑时包含当前图表 XML）
    const formattedTextContent =
      (xml && xml.trim() && isEditRequest)
        ? `当前图表 XML（仅显示关键结构）:\n\`\`\`xml\n${xml.slice(0, 3000)}\n...\n\`\`\`\n\n用户请求: ${lastMessageText}`
        : lastMessageText;

    // 转换消息格式 (v5 需要使用 convertToModelMessages)
    const modelMessages = convertToModelMessages(messages);

    // 过滤空消息
    let enhancedMessages = modelMessages.filter(
      (msg: any) => msg.content && Array.isArray(msg.content) && msg.content.length > 0
    );

    // 更新最后一条消息的内容（保持数组格式）
    if (enhancedMessages.length >= 1) {
      const lastModelMessage = enhancedMessages[enhancedMessages.length - 1];
      if (lastModelMessage.role === "user") {
        // content 必须是数组格式
        const contentParts: any[] = [{ type: "text", text: formattedTextContent }];

        enhancedMessages = [
          ...enhancedMessages.slice(0, -1),
          { ...lastModelMessage, content: contentParts },
        ];
      }
    }

    console.log("[Chat API] Starting stream generation...");

    // 流式生成
    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: enhancedMessages,
      maxOutputTokens: 16384, // 增加输出限制以支持更复杂的图表
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
      temperature: 0.35, // 提升创造性，从 0.1 提升到 0.35
      onFinish: ({ text, toolCalls, usage }) => {
        console.log("[Chat API] Stream finished");
        console.log("[Chat API] Model:", modelId);
        console.log("[Chat API] Text length:", text?.length || 0);
        console.log("[Chat API] Tool calls:", toolCalls?.length || 0);
        console.log("[Chat API] Tool calls detail:", JSON.stringify(toolCalls, null, 2));
        console.log("[Chat API] Usage:", usage);
      },
    });

    console.log("[Chat API] Returning stream response");

    // v5 使用 toUIMessageStreamResponse
    return result.toUIMessageStreamResponse({
      onError: errorHandler,
    });
  } catch (error) {
    console.error("[Chat API] ERROR:", error);

    // 详细错误日志
    if (error instanceof Error) {
      console.error("[Chat API] Error name:", error.name);
      console.error("[Chat API] Error message:", error.message);
      console.error("[Chat API] Error stack:", error.stack);
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