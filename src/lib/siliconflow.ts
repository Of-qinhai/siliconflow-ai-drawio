/**
 * SiliconFlow API 适配器
 *
 * SiliconFlow 兼容 OpenAI API 格式，使用 @ai-sdk/openai 的 createOpenAI 即可
 */

import { createOpenAI } from "@ai-sdk/openai";

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";

/**
 * 创建 SiliconFlow Provider
 * @param apiKey SiliconFlow API Key
 */
export function createSiliconFlowProvider(apiKey: string) {
  const provider = createOpenAI({
    apiKey,
    baseURL: SILICONFLOW_BASE_URL,
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
    id: "zai-org/GLM-4.6",
    name: "GLM-4.6 335B",
    description: "耐心等待，逐过程渲染，适合复杂图表生成",
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
export const DEFAULT_MODEL: ModelId = "Pro/deepseek-ai/DeepSeek-V3";
