import { streamText } from "ai";
import {
  createBizyProvider,
  getBizyConfig,
  type EnhanceRequest,
  type EnhanceResponse,
} from "@/lib/bizy";
import { getEnhancePrompt, buildEnhanceUserMessage } from "@/lib/enhance-prompts";
import { uploadImageToBizyAir, analyzeWithVisionModel } from "@/lib/bizyair-image";

export const maxDuration = 60;

/**
 * 服务端解密 API Key (Base64 解码)
 */
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
    console.error("[Enhance API] Decrypt error:", e);
    return encoded;
  }
}

/**
 * 错误处理函数
 */
function errorHandler(error: unknown): string {
  if (error == null) {
    return "美化失败：未知错误";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("api key") || message.includes("unauthorized")) {
      return "API Key 无效，请检查设置";
    }
    if (message.includes("rate limit")) {
      return "请求过于频繁，请稍后再试";
    }
    if (message.includes("timeout")) {
      return "美化超时，图表可能过于复杂";
    }

    return `美化失败：${error.message}`;
  }

  return "美化失败：服务异常";
}

/**
 * 提取 XML 从响应中
 */
function extractXmlFromResponse(text: string): string {
  // 尝试提取 <root>...</root>
  const rootMatch = text.match(/<root>([\s\S]*?)<\/root>/);
  if (rootMatch) {
    return `<root>${rootMatch[1]}</root>`;
  }

  // 尝试提取 ```xml ... ```
  const codeBlockMatch = text.match(/```xml\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    const xmlContent = codeBlockMatch[1].trim();
    if (xmlContent.includes('<root>')) {
      return xmlContent;
    }
    return `<root>\n${xmlContent}\n</root>`;
  }

  // 如果包含 mxCell，尝试包装
  if (text.includes('<mxCell')) {
    return `<root>\n${text}\n</root>`;
  }

  // 返回原文本
  return text;
}

export async function POST(req: Request) {
  console.log("\n========== [Enhance API] New Request ==========");

  try {
    // 获取请求参数
    const encodedApiKey = req.headers.get("X-Encrypted-Api-Key");
    const modelId = req.headers.get("X-Model-Id");

    // 获取配置来判断使用哪个服务
    const config = getBizyConfig();
    console.log("[Enhance API] Service type:", config.serviceType);

    let apiKey: string | null = null;

    if (config.serviceType === 'custom-api' && config.customApi?.endpoint.includes('bizyair.cn')) {
      // BizyAir 服务：优先使用用户提供的 Key，否则使用环境变量
      if (encodedApiKey) {
        apiKey = decryptApiKeyServer(encodedApiKey);
        if (apiKey) {
           console.log("[Enhance API] Using API Key from headers for BizyAir");
        }
      }

      // 如果没有 header Key，尝试从环境变量读取
      if (!apiKey) {
        apiKey = process.env.BIZYAIR_API_KEY || null;
        if (apiKey) {
           console.log("[Enhance API] Using BizyAir API Key from environment");
        }
      }

      if (!apiKey) {
        console.log("[Enhance API] ERROR: Missing BizyAir API Key");
        return Response.json({
          error: "Missing API Key for BizyAir. Please set it in Settings or configure BIZYAIR_API_KEY in .env"
        }, { status: 401 });
      }
    } else {
      // 使用 LLM 美化时，使用用户的加密 Key
      if (!encodedApiKey) {
        console.log("[Enhance API] ERROR: Missing API Key header");
        return Response.json({ error: "Missing SiliconFlow API Key. Please set it in Settings." }, { status: 401 });
      }

      apiKey = decryptApiKeyServer(encodedApiKey);
      if (!apiKey) {
        console.log("[Enhance API] ERROR: Failed to decrypt API Key");
        return Response.json({ error: "Invalid API Key" }, { status: 401 });
      }

      console.log("[Enhance API] Using user's encrypted API Key");
    }

    const body: EnhanceRequest = await req.json();
    const { xml, mode, imageData, options } = body;

    console.log("[Enhance API] Mode:", mode);
    console.log("[Enhance API] XML length:", xml?.length || 0);
    console.log("[Enhance API] Has image data:", !!imageData);
    console.log("[Enhance API] Options:", options);

    if (!xml || !mode) {
      return Response.json(
        { error: "Missing required fields: xml, mode" },
        { status: 400 }
      );
    }

    // 如果是视觉上传模式，处理图片上传
    if (mode === 'vision-upload' && imageData) {
      console.log("[Enhance API] Using vision upload mode");

      try {
        // 1. 上传图片到 BizyAir
        const uploadResult = await uploadImageToBizyAir(imageData, {
          ...config.imageUpload,
          apiKey,
        });

        if (!uploadResult.success || !uploadResult.imageUrl) {
          throw new Error(uploadResult.error || "Failed to upload image");
        }

        console.log("[Enhance API] Image uploaded:", uploadResult.imageUrl);

        // 2. 使用视觉模型分析
        const analysisPrompt = `
你是一位专业的图表美化专家。请分析这个 draw.io 图表的截图，识别视觉问题：

1. 布局问题：节点重叠、对齐不佳、间距不均
2. 配色问题：颜色单调、对比度不足、缺少层次
3. 连线问题：交叉混乱、流向不清晰
4. 文字问题：大小不合适、被截断

基于分析，生成优化后的 draw.io XML（<root> 标签内容），改进这些问题。
只返回 XML，不要添加任何解释。

当前 XML（供参考）:
\`\`\`xml
${xml.slice(0, 2000)}
\`\`\`
`;

        const visionModelId = "Qwen/Qwen3-VL-235B-A22B-Thinking";
        const visionResult = await analyzeWithVisionModel(
          uploadResult.imageUrl,
          analysisPrompt,
          apiKey,
          visionModelId
        );

        const enhancedXml = visionResult.choices?.[0]?.message?.content;

        if (!enhancedXml) {
          throw new Error("Vision model did not return enhanced XML");
        }

        // 提取 XML
        const extractedXml = extractXmlFromResponse(enhancedXml);

        console.log("[Enhance API] Vision enhancement complete");

        const response: EnhanceResponse = {
          enhancedXml: extractedXml,
          changes: ["基于视觉分析优化了布局", "改进了配色方案", "优化了节点对齐"],
        };

        return Response.json(response);

      } catch (visionError) {
        console.error("[Enhance API] Vision upload error:", visionError);
        return Response.json(
          {
            error: `视觉分析失败: ${visionError instanceof Error ? visionError.message : "Unknown error"}`,
          },
          { status: 500 }
        );
      }
    }

    // 如果是自定义 API
    if (config.serviceType === 'custom-api' && config.customApi) {
      console.log("[Enhance API] Using custom API:", config.customApi.endpoint);

      // 🔧 BizyAir WebApp API 需要图片 URL
      // 先上传图片获取 URL
      let imageUrl = "";

      if (config.customApi.endpoint.includes('bizyair.cn')) {
        if (!imageData) {
          console.log("[Enhance API] ERROR: BizyAir API requires image data");
          return Response.json(
            { error: "BizyAir API requires image data. Please export diagram first." },
            { status: 400 }
          );
        }

        // 上传图片到 BizyAir
        console.log("[Enhance API] Uploading image to BizyAir...");
        const uploadResult = await uploadImageToBizyAir(imageData, {
          apiKey,
          ...config.imageUpload,
        });

        if (!uploadResult.success || !uploadResult.imageUrl) {
          throw new Error(uploadResult.error || "Failed to upload image to BizyAir");
        }

        imageUrl = uploadResult.imageUrl;
        console.log("[Enhance API] Image uploaded successfully:", imageUrl);
      }

      // 构造请求数据
      let requestData: any;

      if (config.customApi.transformRequest) {
        // 使用自定义转换函数，传入图片 URL 而不是 Base64
        requestData = config.customApi.transformRequest({
          ...body,
          imageData: imageUrl
        });
      } else {
        // 默认格式
        requestData = body;
      }

      // 🔍 打印请求数据用于调试
      console.log("[Enhance API] ==================== Request Data ====================");
      console.log("[Enhance API] Endpoint:", config.customApi.endpoint);
      console.log("[Enhance API] Method:", config.customApi.method || 'POST');
      console.log("[Enhance API] Headers:", {
        ...config.customApi.headers,
        'Authorization': 'Bearer ' + apiKey.slice(0, 10) + '...' // 只显示前10位
      });
      console.log("[Enhance API] Request Body:");
      console.log(JSON.stringify(requestData, null, 2)); // 格式化打印
      console.log("[Enhance API] =======================================================");

      const response = await fetch(config.customApi.endpoint, {
        method: config.customApi.method || 'POST',
        headers: {
          ...config.customApi.headers,
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify(requestData),
      });

      console.log("[Enhance API] Response status:", response.status);
      console.log("[Enhance API] Response statusText:", response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Enhance API] Error response body:", errorText);
        throw new Error(`Custom API error: ${response.statusText} - ${errorText}`);
      }

      const responseData = await response.json();

      // 🔍 打印响应数据
      console.log("[Enhance API] ==================== Response Data ====================");
      console.log(JSON.stringify(responseData, null, 2));
      console.log("[Enhance API] ========================================================");

      const result: EnhanceResponse = config.customApi.transformResponse
        ? config.customApi.transformResponse(responseData)
        : responseData;

      console.log("[Enhance API] Custom API success");
      return Response.json(result);
    }

    // 使用 LLM 美化
    console.log("[Enhance API] Using LLM service");
    const provider = createBizyProvider(apiKey, config);

    if (!provider) {
      throw new Error("Failed to create provider");
    }

    const model = provider(modelId || config.llm?.modelId);

    // 获取系统提示词
    const systemPrompt = getEnhancePrompt(mode);

    // 构建用户消息
    const userMessage = buildEnhanceUserMessage(xml, mode, options);

    console.log("[Enhance API] Starting enhancement...");

    // 流式生成
    const result = streamText({
      model,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage },
      ],
      temperature: config.llm?.temperature || 0.2,
      maxOutputTokens: 16384,
    });

    // 收集完整响应
    let fullText = "";
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    console.log("[Enhance API] Enhancement complete, text length:", fullText.length);

    // 提取 XML
    const enhancedXml = extractXmlFromResponse(fullText);

    console.log("[Enhance API] Extracted XML length:", enhancedXml.length);

    const response: EnhanceResponse = {
      enhancedXml,
      changes: ["应用了布局优化", "更新了配色方案", "添加了视觉效果"],
    };

    return Response.json(response);

  } catch (error) {
    console.error("[Enhance API] ERROR:", error);

    if (error instanceof Error) {
      console.error("[Enhance API] Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    }

    return Response.json(
      {
        error: errorHandler(error),
        details: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
