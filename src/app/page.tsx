"use client";

import { useState, useEffect } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { DiagramCanvas } from "@/components/diagram/diagram-canvas";
import { ApiKeyModal } from "@/components/api-key-modal";
import { useApiKey } from "@/hooks/use-api-key";

export default function Home() {
  const { isKeySet, isLoading } = useApiKey();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);

  // 当 API Key 状态变化时，更新弹窗显示状态
  useEffect(() => {
    if (!isLoading && !isKeySet) {
      setShowApiKeyModal(true);
    }
  }, [isKeySet, isLoading]);

  // 加载中时显示加载状态
  if (isLoading) {
    return (
      <main className="flex h-screen items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted-foreground)]">加载中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-[var(--background)]">
      {/* API Key 设置弹窗 */}
      <ApiKeyModal open={showApiKeyModal} onOpenChange={setShowApiKeyModal} />

      {/* 图表画布区域 */}
      <div
        className={`${isChatVisible ? "flex-1" : "w-full"} h-full transition-all duration-300 ease-in-out`}
      >
        <DiagramCanvas />
      </div>

      {/* 聊天面板 */}
      <div
        className={`${isChatVisible ? "w-[420px]" : "w-0 overflow-hidden"} h-full border-l border-[var(--border)] transition-all duration-300 ease-in-out`}
      >
        <ChatPanel
          onOpenApiKeyModal={() => setShowApiKeyModal(true)}
          onTogglePanel={() => setIsChatVisible(!isChatVisible)}
          isPanelVisible={isChatVisible}
        />
      </div>

      {/* 折叠按钮 (当面板隐藏时显示) */}
      {!isChatVisible && (
        <button
          onClick={() => setIsChatVisible(true)}
          className="fixed right-4 top-1/2 -translate-y-1/2 z-50 p-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg hover:scale-110 transition-transform"
          title="展开聊天面板"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}
    </main>
  );
}
