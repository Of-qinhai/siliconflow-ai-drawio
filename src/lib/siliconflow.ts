/**
 * SiliconFlow API 适配器
 *
 * SiliconFlow 兼容 OpenAI API 格式，使用 @ai-sdk/openai 的 createOpenAI 即可
 */

import { createOpenAI } from "@ai-sdk/openai";

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";

type SiliconFlowProviderOptions = {
  /**
   * Log when we have to normalize malformed tool-call chunks from the provider.
   * Useful for debugging OpenAI-compatible streaming deviations.
   */
  debugToolCalls?: boolean;
};

function createSiliconFlowFetch(options?: SiliconFlowProviderOptions) {
  const debugToolCalls = options?.debugToolCalls === true;

  function normalizeToolCallTypes(value: unknown, seenIds: Set<string>): boolean {
    let didNormalize = false;

    const normalizeToolCallArray = (toolCalls: unknown) => {
      if (!Array.isArray(toolCalls)) {
        return;
      }

      for (const toolCall of toolCalls) {
        if (toolCall == null || typeof toolCall !== "object") {
          continue;
        }

        const toolCallRecord = toolCall as Record<string, unknown>;
        if (toolCallRecord.function == null || typeof toolCallRecord.function !== "object") {
          continue;
        }

        if (toolCallRecord.type === "function") {
          continue;
        }

        const originalType = toolCallRecord.type;
        toolCallRecord.type = "function";
        didNormalize = true;

        if (debugToolCalls) {
          const id = typeof toolCallRecord.id === "string" ? toolCallRecord.id : undefined;
          if (id && seenIds.has(id)) {
            continue;
          }
          if (id) {
            seenIds.add(id);
          }

          const fn = toolCallRecord.function as Record<string, unknown>;
          const rawArgs = fn.arguments;
          const argumentsPreview =
            typeof rawArgs === "string"
              ? rawArgs.length > 300
                ? `${rawArgs.slice(0, 300)}…`
                : rawArgs
              : rawArgs;

          console.warn("[siliconflow] Normalized tool_call.type", {
            id: toolCallRecord.id,
            index: toolCallRecord.index,
            originalType,
            patchedType: toolCallRecord.type,
            function: { name: fn.name, arguments: argumentsPreview },
          });
        }
      }
    };

    if (value == null || typeof value !== "object") {
      return false;
    }

    const record = value as Record<string, unknown>;

    normalizeToolCallArray(record.tool_calls);

    if (Array.isArray(record.choices)) {
      for (const choice of record.choices) {
        if (choice == null || typeof choice !== "object") {
          continue;
        }
        const choiceRecord = choice as Record<string, unknown>;
        if (choiceRecord.delta && typeof choiceRecord.delta === "object") {
          normalizeToolCallArray((choiceRecord.delta as Record<string, unknown>).tool_calls);
        }
        if (choiceRecord.message && typeof choiceRecord.message === "object") {
          normalizeToolCallArray((choiceRecord.message as Record<string, unknown>).tool_calls);
        }
      }
    }

    return didNormalize;
  }

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fetch(input, init);

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      return response;
    }

    if (!response.body) {
      return response;
    }

    const seenToolCallIds = new Set<string>();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let buffer = "";

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const reader = response.body!.getReader();

        const pump = (): void => {
          reader
            .read()
            .then(({ done, value }) => {
              if (done) {
                buffer += decoder.decode();
                if (buffer.length > 0) {
                  controller.enqueue(encoder.encode(buffer));
                }
                controller.close();
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                const hasCarriageReturn = line.endsWith("\r");
                const rawLine = hasCarriageReturn ? line.slice(0, -1) : line;

                if (!rawLine.startsWith("data:")) {
                  controller.enqueue(encoder.encode(`${line}\n`));
                  continue;
                }

                const data = rawLine.slice("data:".length).trimStart();
                if (data === "" || data === "[DONE]") {
                  controller.enqueue(encoder.encode(`${line}\n`));
                  continue;
                }

                try {
                  const parsed = JSON.parse(data) as unknown;
                  const didNormalize = normalizeToolCallTypes(parsed, seenToolCallIds);

                  if (!didNormalize) {
                    controller.enqueue(encoder.encode(`${line}\n`));
                    continue;
                  }

                  const nextLine = `data: ${JSON.stringify(parsed)}${hasCarriageReturn ? "\r" : ""}\n`;
                  controller.enqueue(encoder.encode(nextLine));
                } catch {
                  controller.enqueue(encoder.encode(`${line}\n`));
                }
              }

              pump();
            })
            .catch((error) => {
              controller.error(error);
            });
        };

        pump();
      },
    });

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/**
 * 创建 SiliconFlow Provider
 * @param apiKey SiliconFlow API Key
 */
export function createSiliconFlowProvider(apiKey: string, options?: SiliconFlowProviderOptions) {
  const provider = createOpenAI({
    apiKey,
    baseURL: SILICONFLOW_BASE_URL,
    fetch: createSiliconFlowFetch(options),
  });

  // 返回一个函数，调用 .chat() 方法获取 chat 模型（强制使用 /chat/completions 端点）
  return (modelId: string) => provider.chat(modelId);
}

/**
 * 推荐模型列表
 */
export const RECOMMENDED_MODELS = [
  {
    id: "Pro/deepseek-ai/DeepSeek-V3.2",
    name: "DeepSeek V3.2",
    description: "不支持逐过程输出绘制，耐心等待，推理能力强，生成效果非常好",
  },
  {
    id: "Pro/zai-org/GLM-4.7",
    name: "Pro/zai-org/GLM-4.7",
    description: "耐心等待，逐过程渲染，适合复杂图表生成",
  },
  {
    id: "Pro/deepseek-ai/DeepSeek-V3",
    name: "DeepSeek V3",
    description: "推理能力强，逐过程输出绘制，适合复杂图表生成",
  },
  {
    id: "Pro/deepseek-ai/DeepSeek-R1",
    name: "DeepSeek R1",
    description: "耐心等待，推理能力强，支持逐过程渲染",
  },
  {
    id: "Pro/zai-org/GLM-4.7",
    name: "GLM-4.7",
    description: "355B ,智谱出品，逐过程渲染，适合复杂图表生成",
  },
  {
    id: "Pro/moonshotai/Kimi-K2-Thinking",
    name: "Kimi-K2-Thinking",
    description: "耐心等待，逐过程渲染，适合复杂图表生成",
  }
] as const;

export type ModelId = (typeof RECOMMENDED_MODELS)[number]["id"];

/**
 * 默认模型
 */
export const DEFAULT_MODEL: ModelId = "Pro/zai-org/GLM-4.7";
