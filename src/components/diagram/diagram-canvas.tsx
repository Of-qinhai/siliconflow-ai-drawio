"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useDiagram } from "@/contexts/diagram-context";
import { useApiKey } from "@/hooks/use-api-key";
import { useModel } from "@/hooks/use-model";
import { cn, autoFitCanvas } from "@/lib/utils";
import { Maximize2, Minimize2, Download, RotateCcw, Focus, Sparkles, Loader2, X } from "lucide-react";
import type { EnhanceRequest, EnhanceResponse, EnhanceMode } from "@/lib/bizy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// 配置自托管 draw.io 服务地址
// ============================================================
// 方式1: 使用环境变量（推荐）
// 在 .env.local 中设置: NEXT_PUBLIC_DRAWIO_URL=https://drawio.你的域名.com
//
// 方式2: 直接修改下面的地址
// ============================================================
const DRAWIO_BASE_URL = process.env.NEXT_PUBLIC_DRAWIO_URL || "https://embed.diagrams.net";

// 动态导入 DrawIoEmbed 以避免 SSR 问题
const DrawIoEmbed = dynamic(
  () => import("react-drawio").then((mod) => mod.DrawIoEmbed),
  {
    ssr: false,
    loading: () => <DiagramLoading />,
  }
);

function DiagramLoading() {
  return (
    <div className="flex items-center justify-center h-full bg-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">加载图表编辑器...</p>
      </div>
    </div>
  );
}

export function DiagramCanvas() {
  const { drawioRef, handleDiagramExport, clearDiagram, diagramHistory, loadDiagram, chartXML, exportDiagram, exportDiagramAsImage } = useDiagram();
  const { encryptedKey } = useApiKey();
  const { selectedModel } = useModel();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [showEnhanceSuccess, setShowEnhanceSuccess] = useState(false);
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);

  // 导出图表
  const handleExportClick = () => {
    if (drawioRef.current) {
      drawioRef.current.exportDiagram({
        format: "png",
        border: "20" // 添加20像素的边距
      });
    }
  };

  // 撤销到上一个版本
  const handleUndo = () => {
    if (diagramHistory.length > 1) {
      const previousVersion = diagramHistory[diagramHistory.length - 2];
      // 直接加载，不添加新历史记录
      if (drawioRef.current) {
        drawioRef.current.load({ xml: previousVersion.xml });
      }
    }
  };

  // 适应窗口 - 重新调整画布大小使内容居中
  const handleFitToWindow = async () => {
    // 先导出当前图表获取最新状态
    const currentXml = await exportDiagram();
    if (currentXml && drawioRef.current) {
      // 重新应用自动适配并加载
      const fittedXml = autoFitCanvas(currentXml);
      drawioRef.current.load({ xml: fittedXml });
    }
  };

  // 下载美化后的图片
  const handleDownloadEnhancedImage = async () => {
    if (!enhancedImageUrl) return;

    try {
      const response = await fetch(enhancedImageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enhanced-diagram-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      alert("下载失败,请重试");
    }
  };

  // AI 美化图表
  const handleEnhance = async (mode: EnhanceMode = 'comprehensive') => {
    setIsEnhancing(true);
    setEnhanceError(null);
    setShowEnhanceSuccess(false);

    try {
      console.log("[DiagramCanvas] Starting enhancement, mode:", mode);

      // 1. 导出当前图表 XML
      const currentXml = await exportDiagram();

      if (!currentXml || currentXml.trim() === '') {
        throw new Error("图表为空，无法美化");
      }

      console.log("[DiagramCanvas] Current XML length:", currentXml.length);

      // 2. ⚠️ 重要：BizyAir WebApp API 需要图片，所以总是导出图片
      // 检查是否使用 BizyAir（通过环境变量判断）
      const usingBizyAir = process.env.NEXT_PUBLIC_BIZY_ENDPOINT?.includes('bizyair.cn');

      let imageData: string | undefined;
      if (mode === 'vision-upload' || usingBizyAir) {
        console.log("[DiagramCanvas] Exporting diagram as image...");

        // 使用新的 exportDiagramAsImage 方法
        imageData = await exportDiagramAsImage();

        console.log("[DiagramCanvas] Image exported, size:", imageData.length);
      }

      // 3. 调用美化 API
      const requestBody: EnhanceRequest = {
        xml: currentXml,
        mode: mode,
        imageData: imageData,
        options: {
          colorScheme: 'modern',
          addShadows: true,
          addAnimations: true,
          fontSize: 'medium',
          useVisionModel: mode === 'vision-upload',
        },
      };

      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Encrypted-Api-Key': encryptedKey || '',
          'X-Model-Id': selectedModel,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `美化失败: ${response.statusText}`);
      }

      const result: EnhanceResponse = await response.json();

      console.log("[DiagramCanvas] Enhancement result:", result);

      // 检查是否返回图片 URL (BizyAir 模式)
      if (result.imageUrl) {
        console.log("[DiagramCanvas] Got enhanced image URL:", result.imageUrl);
        setEnhancedImageUrl(result.imageUrl);
        setShowEnhanceSuccess(true);
        setTimeout(() => setShowEnhanceSuccess(false), 3000);
        return;
      }

      // 否则检查 XML (LLM 模式)
      if (!result.enhancedXml) {
        throw new Error("美化服务未返回有效的 XML 或图片");
      }

      // 4. 加载美化后的图表
      loadDiagram(result.enhancedXml);

      // 5. 显示成功提示
      setShowEnhanceSuccess(true);
      setTimeout(() => setShowEnhanceSuccess(false), 3000);

      console.log("[DiagramCanvas] Enhancement complete");
    } catch (error) {
      console.error("[DiagramCanvas] Enhancement error:", error);
      const errorMessage = error instanceof Error ? error.message : '美化失败，请重试';
      setEnhanceError(errorMessage);

      // 5 秒后自动清除错误
      setTimeout(() => setEnhanceError(null), 5000);
    } finally {
      setIsEnhancing(false);
    }
  };

  return (
    <div
      className={cn("relative h-full bg-white", isFullscreen && "fixed inset-0 z-40")}
    >
      {/* 工具栏 */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {diagramHistory.length > 1 && (
          <button
            onClick={handleUndo}
            className={cn(
              "p-2 rounded-lg bg-white/90 backdrop-blur shadow-md",
              "hover:bg-white transition-colors",
              "text-gray-600 hover:text-gray-900"
            )}
            title="撤销"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={handleFitToWindow}
          className={cn(
            "p-2 rounded-lg bg-white/90 backdrop-blur shadow-md",
            "hover:bg-white transition-colors",
            "text-gray-600 hover:text-gray-900"
          )}
          title="适应窗口"
        >
          <Focus className="w-5 h-5" />
        </button>

        {/* AI 美化按钮 */}
        <button
          onClick={() => handleEnhance('comprehensive')}
          disabled={isEnhancing || !chartXML || chartXML.trim() === ''}
          className={cn(
            "p-2 rounded-lg bg-white/90 backdrop-blur shadow-md",
            "hover:bg-white transition-all",
            "text-purple-600 hover:text-purple-700",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            isEnhancing && "animate-pulse"
          )}
          title="AI 美化图表"
        >
          {isEnhancing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
        </button>

        <button
          onClick={handleExportClick}
          className={cn(
            "p-2 rounded-lg bg-white/90 backdrop-blur shadow-md",
            "hover:bg-white transition-colors",
            "text-gray-600 hover:text-gray-900"
          )}
          title="导出图片"
        >
          <Download className="w-5 h-5" />
        </button>

        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className={cn(
            "p-2 rounded-lg bg-white/90 backdrop-blur shadow-md",
            "hover:bg-white transition-colors",
            "text-gray-600 hover:text-gray-900"
          )}
          title={isFullscreen ? "退出全屏" : "全屏"}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>

      {/* 美化成功提示 */}
      {showEnhanceSuccess && (
        <div className="absolute top-20 right-4 z-10 animate-in slide-in-from-top-2 fade-in">
          <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">图表已美化！</span>
          </div>
        </div>
      )}

      {/* 美化错误提示 */}
      {enhanceError && (
        <div className="absolute top-20 right-4 z-10 animate-in slide-in-from-top-2 fade-in">
          <div className="bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg max-w-xs">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <div className="font-medium text-sm">美化失败</div>
                <div className="text-xs mt-1 opacity-90">{enhanceError}</div>
              </div>
              <button
                onClick={() => setEnhanceError(null)}
                className="text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* draw.io 嵌入 - 支持自托管服务 */}
      <DrawIoEmbed
        ref={drawioRef}
        baseUrl={DRAWIO_BASE_URL}
        onExport={handleDiagramExport}
        urlParameters={{
          spin: true,
          libraries: true,
          saveAndExit: false,
          noExitBtn: true,
          ui: "min",
          noSaveBtn: true,
          grid: true,
          nav: true,
        }}
      />

      {/* 美化后图片预览弹窗 */}
      <Dialog open={!!enhancedImageUrl} onOpenChange={(open) => !open && setEnhancedImageUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              美化完成
            </DialogTitle>
            <DialogDescription>
              图表已美化完成,您可以预览或下载美化后的图片
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {/* 图片预览 */}
            {enhancedImageUrl && (
              <div className="relative bg-gray-50 rounded-lg overflow-hidden border">
                <img
                  src={enhancedImageUrl}
                  alt="Enhanced diagram"
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => setEnhancedImageUrl(null)}
                className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={handleDownloadEnhancedImage}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                下载图片
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
