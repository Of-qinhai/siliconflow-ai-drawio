"use client";

import { useState, useEffect, useCallback } from "react";
import { DEFAULT_MODEL, type ModelId } from "@/lib/siliconflow";

const STORAGE_KEY = "e-ppt-selected-model";

interface UseModelReturn {
  selectedModel: ModelId;
  setSelectedModel: (model: ModelId) => void;
}

/**
 * 模型选择 Hook
 * 
 * - 持久化到 localStorage
 * - 提供默认模型
 */
export function useModel(): UseModelReturn {
  const [selectedModel, setSelectedModelState] = useState<ModelId>(DEFAULT_MODEL);

  // 初始化时从 localStorage 加载
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSelectedModelState(stored as ModelId);
      }
    }
  }, []);

  // 设置模型并持久化
  const setSelectedModel = useCallback((model: ModelId) => {
    setSelectedModelState(model);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, model);
    }
  }, []);

  return {
    selectedModel,
    setSelectedModel,
  };
}

