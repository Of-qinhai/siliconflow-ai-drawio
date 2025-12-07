"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  encryptApiKey,
  storeEncryptedKey,
  getStoredEncryptedKey,
  clearStoredKey,
} from "@/lib/crypto";

interface ApiKeyContextType {
  apiKey: string | null;
  encryptedKey: string | null;
  isKeySet: boolean;
  isLoading: boolean;
  setApiKey: (key: string) => Promise<void>;
  clearApiKey: () => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [encryptedKey, setEncryptedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化时从 sessionStorage 加载
  useEffect(() => {
    const stored = getStoredEncryptedKey();
    if (stored) {
      setEncryptedKey(stored);
      setApiKeyState("[已设置]");
    }
    setIsLoading(false);
  }, []);

  // 设置新的 API Key
  const setApiKey = useCallback(async (key: string) => {
    try {
      console.log("[ApiKeyContext] setApiKey called with:", key.slice(0, 10) + "...");
      const encrypted = await encryptApiKey(key);
      console.log("[ApiKeyContext] Encrypted Key:", encrypted.slice(0, 20) + "...");
      storeEncryptedKey(encrypted);
      setEncryptedKey(encrypted);
      setApiKeyState("[已设置]");
      console.log("[ApiKeyContext] API Key saved successfully");
    } catch (error) {
      console.error("[ApiKeyContext] Failed to encrypt API key:", error);
      throw new Error("加密 API Key 失败");
    }
  }, []);

  // 清除 API Key
  const clearApiKey = useCallback(() => {
    clearStoredKey();
    setApiKeyState(null);
    setEncryptedKey(null);
    console.log("[ApiKeyContext] API Key cleared");
  }, []);

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey,
        encryptedKey,
        isKeySet: !!encryptedKey,
        isLoading,
        setApiKey,
        clearApiKey,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey(): ApiKeyContextType {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error("useApiKey must be used within an ApiKeyProvider");
  }
  return context;
}