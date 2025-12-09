"use client";

import React, { createContext, useContext, useRef, useState, useCallback } from "react";
import type { DrawIoEmbedRef } from "react-drawio";
import * as pako from "pako";
import { autoFitCanvas } from "@/lib/utils";

interface DiagramHistory {
  xml: string;
  timestamp: number;
}

interface DiagramContextType {
  // 状态
  chartXML: string;
  isLoading: boolean;
  diagramHistory: DiagramHistory[];

  // Ref
  drawioRef: React.RefObject<DrawIoEmbedRef | null>;

  // 方法
  loadDiagram: (xml: string) => void;
  exportDiagram: () => Promise<string>;
  exportDiagramAsImage: () => Promise<string>; // 新增：导出为图片
  clearDiagram: () => void;
  applyEdits: (edits: Array<{ search: string; replace: string }>) => void;
  setChartXML: (xml: string) => void;
  setIsLoading: (loading: boolean) => void;

  // 导出处理
  handleDiagramExport: (data: { data: string }) => void;
  resolverRef: React.MutableRefObject<((value: string) => void) | null>;
  imageResolverRef: React.MutableRefObject<((value: string) => void) | null>; // 新增：图片导出 resolver
}

const DiagramContext = createContext<DiagramContextType | undefined>(undefined);

// 空图表模板
const EMPTY_DIAGRAM = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;

/**
 * 从导出的 SVG 中提取 XML（与 next-ai-draw-io 相同）
 */
function extractDiagramXML(svgData: string): string {
  try {
    // 1. 解析 SVG
    const svgString = atob(svgData.slice(26));
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgElement = svgDoc.querySelector("svg");

    if (!svgElement) {
      throw new Error("No SVG element found");
    }

    // 2. 提取 content 属性
    const encodedContent = svgElement.getAttribute("content");
    if (!encodedContent) {
      throw new Error("SVG does not have content attribute");
    }

    // 3. 解码 HTML 实体
    const textarea = document.createElement("textarea");
    textarea.innerHTML = encodedContent;
    const xmlContent = textarea.value;

    // 4. 解析 XML
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    const diagramElement = xmlDoc.querySelector("diagram");

    if (!diagramElement) {
      throw new Error("No diagram element found");
    }

    // 5. 提取 base64 编码数据
    const base64EncodedData = diagramElement.textContent;
    if (!base64EncodedData) {
      throw new Error("No encoded data found");
    }

    // 6. Base64 解码
    const binaryString = atob(base64EncodedData);

    // 7. 转换为 Uint8Array
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 8. 使用 pako 解压
    const decompressedData = pako.inflate(bytes, { windowBits: -15 });

    // 9. 转换为字符串
    const decoder = new TextDecoder("utf-8");
    const decodedString = decoder.decode(decompressedData);

    // 10. URL 解码
    return decodeURIComponent(decodedString);
  } catch (error) {
    console.error("Error extracting diagram XML:", error);
    // 回退到简单提取
    try {
      const match = svgData.match(/content="([^"]+)"/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    } catch {
      // ignore
    }
    return svgData;
  }
}

export function DiagramProvider({ children }: { children: React.ReactNode }) {
  const [chartXML, setChartXML] = useState<string>(EMPTY_DIAGRAM);
  const [isLoading, setIsLoading] = useState(false);
  const [diagramHistory, setDiagramHistory] = useState<DiagramHistory[]>([]);

  const drawioRef = useRef<DrawIoEmbedRef | null>(null);
  const resolverRef = useRef<((value: string) => void) | null>(null);
  const imageResolverRef = useRef<((value: string) => void) | null>(null); // 图片导出 resolver

  // 加载图表 - 自动适配画布大小后传给 draw.io，并保存历史记录
  const loadDiagram = useCallback((xml: string) => {
    if (drawioRef.current) {
      // 自动调整画布大小以适应内容
      const fittedXml = autoFitCanvas(xml);
      drawioRef.current.load({ xml: fittedXml });
      setChartXML(fittedXml);

      // 保存到历史记录（最多保留 50 条）
      setDiagramHistory(prev => {
        const newHistory = [
          ...prev.slice(-49), // 保留最近 49 条
          { xml: fittedXml, timestamp: Date.now() }
        ];
        return newHistory;
      });
    }
  }, []);

  // 导出图表 (XML)
  const exportDiagram = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      if (drawioRef.current) {
        resolverRef.current = resolve;
        drawioRef.current.exportDiagram({ format: "xmlsvg" });
      } else {
        resolve(chartXML);
      }
    });
  }, [chartXML]);

  // 导出图表为图片 (PNG Base64)
  const exportDiagramAsImage = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (drawioRef.current) {
        imageResolverRef.current = resolve;

        // 设置超时
        const timeoutId = setTimeout(() => {
          imageResolverRef.current = null;
          reject(new Error("Image export timeout"));
        }, 30000);

        // 清除超时的函数
        const originalResolver = resolve;
        imageResolverRef.current = (value: string) => {
          clearTimeout(timeoutId);
          originalResolver(value);
        };

        // 导出图片,添加边距,使用3倍缩放提高清晰度
        drawioRef.current.exportDiagram({
          format: "png",
          scale: 5.0,            // 3倍缩放,导出高清图片
          border: "20",          // 添加20像素的边距
          background: '#ffffff'  // 白色背景
        });
      } else {
        reject(new Error("DrawIO reference not available"));
      }
    });
  }, []);

  // 清空图表
  const clearDiagram = useCallback(() => {
    if (drawioRef.current) {
      drawioRef.current.load({ xml: EMPTY_DIAGRAM });
    }
    setChartXML(EMPTY_DIAGRAM);
    setDiagramHistory([]);
  }, []);

  // 应用编辑
  const applyEdits = useCallback(
    (edits: Array<{ search: string; replace: string }>) => {
      let newXML = chartXML;
      for (const edit of edits) {
        newXML = newXML.replace(edit.search, edit.replace);
      }
      loadDiagram(newXML);
    },
    [chartXML, loadDiagram]
  );

  // 处理导出回调
  const handleDiagramExport = useCallback((data: { data: string }) => {
    // 判断是 XML 导出还是图片导出
    if (data.data.startsWith('data:image/png')) {
      // 图片导出
      if (imageResolverRef.current) {
        imageResolverRef.current(data.data);
        imageResolverRef.current = null;
      }
    } else {
      // XML 导出
      const extractedXML = extractDiagramXML(data.data);
      setChartXML(extractedXML);

      if (resolverRef.current) {
        resolverRef.current(extractedXML);
        resolverRef.current = null;
      }
    }
  }, []);

  return (
    <DiagramContext.Provider
      value={{
        chartXML,
        isLoading,
        diagramHistory,
        drawioRef,
        loadDiagram,
        exportDiagram,
        exportDiagramAsImage,
        clearDiagram,
        applyEdits,
        setChartXML,
        setIsLoading,
        handleDiagramExport,
        resolverRef,
        imageResolverRef,
      }}
    >
      {children}
    </DiagramContext.Provider>
  );
}

export function useDiagram() {
  const context = useContext(DiagramContext);
  if (context === undefined) {
    throw new Error("useDiagram must be used within a DiagramProvider");
  }
  return context;
}
