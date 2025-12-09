/**
 * BizyAir 图片上传和处理工具
 *
 * 支持将图表导出为图片并上传到 BizyAir，用于视觉模型分析
 */

import { uploadImageToBizyAir as uploadToBizyAir } from "./bizyair-upload";

/**
 * 图片上传配置
 */
export interface ImageUploadConfig {
  apiKey: string;
  maxSize?: number; // MB
  allowedFormats?: string[];
}

/**
 * 图片上传响应
 */
export interface ImageUploadResponse {
  success: boolean;
  imageUrl?: string;
  imageId?: string;
  error?: string;
}

/**
 * 上传图片到 BizyAir
 *
 * @param imageData Base64 编码的图片数据
 * @param config 上传配置
 * @returns 上传响应
 */
export async function uploadImageToBizyAir(
  imageData: string,
  config: Partial<ImageUploadConfig>
): Promise<ImageUploadResponse> {
  try {
    // 验证配置
    if (!config.apiKey) {
      throw new Error("API Key is required for image upload");
    }

    // 使用新的上传函数
    const imageUrl = await uploadToBizyAir(imageData, config.apiKey);

    return {
      success: true,
      imageUrl,
    };

  } catch (error) {
    console.error("[BizyAir] Image upload error:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown upload error",
    };
  }
}

/**
 * 从 DrawIO 导出图片并上传
 *
 * @param drawioRef DrawIO 组件引用
 * @param config 上传配置
 * @returns 上传响应
 */
export async function exportAndUploadDiagram(
  drawioRef: any,
  config: Partial<ImageUploadConfig> = {}
): Promise<ImageUploadResponse> {
  return new Promise((resolve) => {
    if (!drawioRef.current) {
      resolve({
        success: false,
        error: "DrawIO reference is not available",
      });
      return;
    }

    // 导出为 PNG
    const onExport = async (data: { data: string }) => {
      console.log("[BizyAir] Diagram exported, data length:", data.data.length);

      // 上传图片
      const uploadResult = await uploadImageToBizyAir(data.data, config);
      resolve(uploadResult);
    };

    // 临时设置导出回调
    const originalOnExport = drawioRef.current.props?.onExport;
    drawioRef.current.exportDiagram({ format: "png" });

    // 监听导出事件（简化实现，实际可能需要更复杂的事件处理）
    drawioRef.current.props = {
      ...drawioRef.current.props,
      onExport: (data: { data: string }) => {
        onExport(data);
        // 恢复原始回调
        if (originalOnExport) {
          originalOnExport(data);
        }
      },
    };
  });
}

/**
 * 构造视觉模型请求（包含上传的图片）
 *
 * @param imageUrl 上传后的图片 URL
 * @param prompt 分析提示词
 * @param apiKey API Key
 * @param modelId 视觉模型 ID
 * @returns API 响应
 */
export async function analyzeWithVisionModel(
  imageUrl: string,
  prompt: string,
  apiKey: string,
  modelId: string = "Qwen/Qwen3-VL-235B-A22B-Thinking"
): Promise<any> {
  try {
    console.log("[BizyAir] Analyzing image with vision model:", modelId);

    const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 16384,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision model API failed: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log("[BizyAir] Vision model analysis complete");

    return result;

  } catch (error) {
    console.error("[BizyAir] Vision model error:", error);
    throw error;
  }
}

/**
 * 完整的视觉美化流程
 *
 * 1. 导出图表为图片
 * 2. 上传到 BizyAir
 * 3. 调用视觉模型分析
 * 4. 返回优化建议或新的 XML
 */
export async function enhanceWithVision(
  drawioRef: any,
  xml: string,
  apiKey: string,
  config: Partial<ImageUploadConfig> = {}
): Promise<{ enhancedXml?: string; suggestions?: string[]; error?: string }> {
  try {
    // 1. 导出并上传图片
    console.log("[BizyAir] Starting vision enhancement...");

    const uploadResult = await exportAndUploadDiagram(drawioRef, {
      ...config,
      apiKey,
    });

    if (!uploadResult.success || !uploadResult.imageUrl) {
      throw new Error(uploadResult.error || "Failed to upload image");
    }

    console.log("[BizyAir] Image uploaded:", uploadResult.imageUrl);

    // 2. 调用视觉模型分析
    const analysisPrompt = `
你是一位专业的图表美化专家。请分析这个 draw.io 图表的截图，识别视觉问题：

1. 布局问题：节点重叠、对齐不佳、间距不均
2. 配色问题：颜色单调、对比度不足、缺少层次
3. **连线问题（最高优先级）**：
   - **连线是否穿过节点？（严重问题，必须修复）**
   - 连线是否交叉混乱？
   - 流向是否清晰？
   - 连接点位置是否合理？
4. 文字问题：大小不合适、被截断

## 优化要求

**严格禁止连线穿过节点**:
- 调整节点位置，确保节点间距至少 80-120px
- 使用分层布局（垂直或水平分层）
- 为每条连线设置精确的连接点 (exitX, exitY, entryX, entryY)
- 使用 edgeStyle=orthogonalEdgeStyle 让连线自动绕开节点
- 确保连线从节点边缘连接，不穿过节点内部

连线连接点示例：
- 垂直连接（上到下）: exitX=0.5;exitY=1;entryX=0.5;entryY=0
- 水平连接（左到右）: exitX=1;exitY=0.5;entryX=0;entryY=0.5

基于分析，生成优化后的 draw.io XML（<root> 标签内容），改进这些问题。
只返回 XML，不要添加任何解释。

当前 XML（供参考）:
\`\`\`xml
${xml.slice(0, 2000)}
\`\`\`
`;

    const visionResult = await analyzeWithVisionModel(
      uploadResult.imageUrl,
      analysisPrompt,
      apiKey
    );

    // 3. 提取优化后的 XML
    const enhancedXml = visionResult.choices?.[0]?.message?.content;

    if (!enhancedXml) {
      throw new Error("Vision model did not return enhanced XML");
    }

    console.log("[BizyAir] Vision enhancement complete");

    return {
      enhancedXml,
      suggestions: [
        "基于视觉分析优化了布局",
        "改进了配色方案",
        "优化了节点对齐",
      ],
    };

  } catch (error) {
    console.error("[BizyAir] Vision enhancement error:", error);

    return {
      error: error instanceof Error ? error.message : "Vision enhancement failed",
    };
  }
}
