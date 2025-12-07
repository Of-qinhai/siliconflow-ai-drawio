"use client";

import { useState, useRef, useEffect } from "react";
import { RECOMMENDED_MODELS, type ModelId } from "@/lib/siliconflow";
import { cn } from "@/lib/utils";
import { ChevronDown, Check, Cpu } from "lucide-react";

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedModel = RECOMMENDED_MODELS.find((m) => m.id === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          "bg-secondary text-secondary-foreground",
          "hover:bg-accent transition-colors",
          "text-sm font-medium border-0"
        )}
      >
        <Cpu className="w-4 h-4" />
        <span className="max-w-[120px] truncate">{selectedModel?.name || "选择模型"}</span>
        <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-2 w-72 z-50",
            "bg-card border border-border rounded-xl shadow-2xl",
            "py-2 animate-in fade-in-0 zoom-in-95"
          )}
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs text-muted-foreground">选择 AI 模型</p>
          </div>

          <div className="py-1">
            {RECOMMENDED_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onChange(model.id as ModelId);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-left hover:bg-accent transition-colors",
                  "flex items-start gap-3"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5",
                    value === model.id
                      ? "border-blue-500 bg-blue-500"
                      : "border-border"
                  )}
                >
                  {value === model.id && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{model.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {model.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

