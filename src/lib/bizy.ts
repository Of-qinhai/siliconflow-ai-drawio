/**
 * Bizy - 图表美化服务配置
 *
 * 支持灵活配置第三方美化服务或使用 LLM 进行美化
 */

import { createOpenAI } from "@ai-sdk/openai";

/**
 * 美化服务类型
 */
export type EnhanceServiceType = 'llm' | 'custom-api';

/**
 * 美化模式
 */
export type EnhanceMode = 'layout' | 'color' | 'comprehensive' | 'visual' | 'vision-upload';

/**
 * 美化服务配置
 */
export interface BizyConfig {
  serviceType: EnhanceServiceType;

  // LLM 服务配置
  llm?: {
    baseURL: string;
    modelId: string;
    temperature?: number;
  };

  // 自定义 API 配置
  customApi?: {
    endpoint: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    transformRequest?: (data: EnhanceRequest) => any;
    transformResponse?: (data: any) => EnhanceResponse;
  };

  // BizyAir 图片上传配置
  imageUpload?: {
    maxSize?: number;
    allowedFormats?: string[];
  };
}

/**
 * 美化请求参数
 */
export interface EnhanceRequest {
  xml: string;
  mode: EnhanceMode;
  imageData?: string; // Base64 编码的图片数据（用于视觉模型）
  customPrompt?: string; // 用户自定义的美化提示词
  options?: {
    targetWidth?: number;
    targetHeight?: number;
    colorScheme?: 'modern' | 'professional' | 'vibrant' | 'minimal';
    addShadows?: boolean;
    addAnimations?: boolean;
    fontSize?: 'small' | 'medium' | 'large';
    useVisionModel?: boolean; // 是否使用视觉模型
  };
}

/**
 * 美化响应结果
 */
export interface EnhanceResponse {
  enhancedXml?: string;      // LLM 返回的 XML
  imageUrl?: string;         // BizyAir 返回的图片 URL
  changes?: string[];
  suggestions?: string[];
}

/**
 * 默认配置 - 使用 SiliconFlow LLM
 */
export const DEFAULT_BIZY_CONFIG: BizyConfig = {
  serviceType: 'llm',
  llm: {
    baseURL: "https://api.siliconflow.cn/v1",
    modelId: "Pro/deepseek-ai/DeepSeek-V3.2", // 使用高效模型
    temperature: 0.2, // 低温度确保稳定性
  },
  imageUpload: {
    maxSize: 10, // 10MB
    allowedFormats: ["image/png", "image/jpeg", "image/jpg"],
  },
};

/**
 * 自定义 API 配置示例
 *
 * 如果你有第三方美化服务，可以这样配置：
 */
export const CUSTOM_API_CONFIG_EXAMPLE: BizyConfig = {
  serviceType: 'custom-api',
  customApi: {
    endpoint: "https://your-api.com/enhance",
    method: "POST",
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': 'Bearer your-token', // 如需要
    },
    // 自定义请求转换
    transformRequest: (data: EnhanceRequest) => ({
      diagram_xml: data.xml,
      enhancement_type: data.mode,
      settings: data.options,
    }),
    // 自定义响应转换
    transformResponse: (data: any) => ({
      enhancedXml: data.result_xml || data.enhanced_diagram,
      changes: data.modifications,
      suggestions: data.recommendations,
    }),
  },
};

/**
 * 创建美化服务 Provider
 */
export function createBizyProvider(apiKey: string, config: BizyConfig = DEFAULT_BIZY_CONFIG) {
  if (config.serviceType === 'llm' && config.llm) {
    const provider = createOpenAI({
      apiKey,
      baseURL: config.llm.baseURL,
    });

    return (modelId?: string) => provider.chat(modelId || config.llm!.modelId);
  }

  // 自定义 API 不需要 provider
  return null;
}

/**
 * 推荐的美化模型列表
 */
export const ENHANCE_MODELS = [
  {
    id: "Pro/deepseek-ai/DeepSeek-V3.2",
    name: "DeepSeek V3.2",
    description: "高效，适合快速美化",
    speed: "fast",
    quality: "high",
  },
  {
    id: "Pro/deepseek-ai/DeepSeek-V3",
    name: "DeepSeek V3",
    description: "推理能力强，美化效果最佳",
    speed: "medium",
    quality: "excellent",
  },
  {
    id: "Qwen/Qwen3-VL-235B-A22B-Thinking",
    name: "Qwen3-VL (视觉)",
    description: "视觉理解，可分析图表图像",
    speed: "slow",
    quality: "excellent",
    supportsVision: true,
  },
] as const;

/**
 * 美化模式描述
 */
export const ENHANCE_MODE_DESCRIPTIONS: Record<EnhanceMode, string> = {
  layout: "优化布局和对齐",
  color: "优化配色方案",
  comprehensive: "全面美化（推荐）",
  visual: "基于视觉分析美化",
  "vision-upload": "上传图片后视觉分析",
};

/**
 * 默认美化模型
 */
export const DEFAULT_ENHANCE_MODEL = "Pro/deepseek-ai/DeepSeek-V3.2";

/**
 * 获取当前配置
 * 可以从环境变量覆盖默认配置
 */
export function getBizyConfig(): BizyConfig {
  // 检查环境变量是否配置了自定义 API
  const customEndpoint = process.env.NEXT_PUBLIC_BIZY_ENDPOINT;

  if (customEndpoint) {
    return {
      serviceType: 'custom-api',
      customApi: {
        endpoint: customEndpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // BizyAir WebApp API 请求转换
        transformRequest: (data: EnhanceRequest) => {
          // 使用用户自定义提示词，如果没有则使用默认提示词
          const prompt = data.customPrompt || `画一块黑板，在上面用粉笔画下这个图表`;

          // 注意：imageData 应该已经是上传后的 URL
          const imageUrl = data.imageData || "";

          return {
            web_app_id: 39568,
            suppress_preview_output: false,
            input_values: {
              "3:LoadImage.image": imageUrl,
              "1:BizyAir_NanoBananaProOfficial.prompt": prompt,
              "1:BizyAir_NanoBananaProOfficial.aspect_ratio": "4:3",
              "1:BizyAir_NanoBananaProOfficial.resolution": "auto"
            }
          };
        },
        // BizyAir WebApp API 响应转换
        transformResponse: (data: any) => {
          // BizyAir 返回的是美化后的图片,而不是 XML
          // 响应格式: { outputs: [{ object_url: "https://..." }] }
          const imageUrl = data.outputs?.[0]?.object_url || "";

          if (!imageUrl) {
            console.error("[BizyAir] No image URL in response:", data);
          }

          return {
            imageUrl: imageUrl,
            changes: ["应用了 BizyAir 美化"],
            suggestions: ["图片已生成,可下载查看"]
          };
        },
      },
    };
  }

  // 默认使用 LLM
  return DEFAULT_BIZY_CONFIG;
}
