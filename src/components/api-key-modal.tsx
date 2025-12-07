"use client";

import { useState } from "react";
import { useApiKey } from "@/hooks/use-api-key";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Key, X } from "lucide-react";

interface ApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyModal({ open, onOpenChange }: ApiKeyModalProps) {
  const { setApiKey, isKeySet, clearApiKey } = useApiKey();

  const [value, setValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!value.trim()) {
      setError("请输入 API Key");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log("[ApiKeyModal] Setting API Key:", value.trim().slice(0, 10) + "...");
      await setApiKey(value.trim());
      setValue("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "设置失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    clearApiKey();
    setValue("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* 弹窗内容 */}
      <div className="relative bg-[var(--card)] rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 border border-[var(--border)]">
        {/* 关闭按钮 */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 标题 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Key className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">设置 API Key</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              配置 SiliconFlow AI 服务密钥
            </p>
          </div>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--foreground)] flex items-center justify-between">
              <span>SiliconFlow API Key</span>
              {isKeySet && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  已设置
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={isKeySet ? "已设置 (输入新 Key 以更换)" : "sk-xxxxxxxxxxxxxxxx"}
                className={cn(
                  "w-full px-4 py-3 pr-12 rounded-lg border bg-[var(--background)]",
                  "text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500",
                  "transition-all duration-200"
                )}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {isKeySet && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-xs text-red-500 hover:underline"
                >
                  清除 Key
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full py-3 rounded-lg font-medium transition-all duration-200",
              "bg-gradient-to-r from-blue-500 to-purple-600 text-white",
              "hover:opacity-90 active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isLoading ? "保存中..." : "保存设置"}
          </button>
        </form>

        {/* 提示信息 */}
        <div className="mt-6 pt-4 border-t border-[var(--border)] space-y-2">
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            🔗
            <a
              href="https://cloud.siliconflow.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline ml-1"
            >
              获取 SiliconFlow API Key →
            </a>
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            🔒 API Key 加密存储在本地浏览器中，绝不上传到服务器。
          </p>
        </div>
      </div>
    </div>
  );
}