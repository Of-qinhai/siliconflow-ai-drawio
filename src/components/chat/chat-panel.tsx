"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useApiKey } from "@/hooks/use-api-key";
import { useModel } from "@/hooks/use-model";
import { useDiagram } from "@/contexts/diagram-context";
import { ModelSelector } from "./model-selector";
import { cn, convertToLegalXml, replaceNodes } from "@/lib/utils";
import {
  Send,
  Settings,
  Sparkles,
  Trash2,
  PanelRightClose,
  FileCode,
  Pencil,
  Loader2,
} from "lucide-react";

interface ChatPanelProps {
  onOpenApiKeyModal: () => void;
  onTogglePanel: () => void;
  isPanelVisible: boolean;
}

export function ChatPanel({ onOpenApiKeyModal, onTogglePanel }: ChatPanelProps) {
  const { isKeySet, encryptedKey } = useApiKey();
  const { selectedModel, setSelectedModel } = useModel();
  const {
    loadDiagram,
    applyEdits,
    exportDiagram,
    clearDiagram,
    chartXML,
  } = useDiagram();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousXMLRef = useRef<string>("");
  const [inputValue, setInputValue] = useState("");

  const handleDisplayChart = useCallback(
    (xml: string) => {
      const currentXml = xml || "";
      const convertedXml = convertToLegalXml(currentXml);

      if (convertedXml !== previousXMLRef.current) {
        previousXMLRef.current = convertedXml;
        try {
          const replacedXML = replaceNodes(chartXML, convertedXml);
          loadDiagram(replacedXML);
        } catch (error) {
          loadDiagram(convertedXml);
        }
      }
    },
    [chartXML, loadDiagram]
  );

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const { messages, sendMessage, addToolResult, status, error, setMessages, stop } = useChat({
    transport,
    async onToolCall({ toolCall }) {
      if (toolCall.toolName === "display_diagram") {
        addToolResult({
          tool: "display_diagram",
          toolCallId: toolCall.toolCallId,
          output: "Successfully displayed the diagram.",
        });
      } else if (toolCall.toolName === "edit_diagram") {
        const { edits } = toolCall.input as {
          edits: Array<{ search: string; replace: string }>;
        };

        try {
          applyEdits(edits);
          addToolResult({
            tool: "edit_diagram",
            toolCallId: toolCall.toolCallId,
            output: `Successfully applied ${edits.length} edit(s) to the diagram.`,
          });
        } catch (error) {
          addToolResult({
            tool: "edit_diagram",
            toolCallId: toolCall.toolCallId,
            output: `Edit failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    },
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const processedToolCalls = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage.parts) return;

    latestMessage.parts.forEach((part: any) => {
      if (part.type?.startsWith("tool-")) {
        const { toolCallId, state } = part;

        if (part.type === "tool-display_diagram" && part.input?.xml) {
          let cleanXml = part.input.xml;
          if (cleanXml.includes("<![CDATA[")) {
            cleanXml = cleanXml.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
          }

          if (state === "input-streaming" || state === "input-available") {
            handleDisplayChart(cleanXml);
          }
          else if (state === "output-available" && !processedToolCalls.current.has(toolCallId)) {
            handleDisplayChart(cleanXml);
            processedToolCalls.current.add(toolCallId);
          }
        }
      }
    });
  }, [messages, handleDisplayChart]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isProcessing = status === "streaming" || status === "submitted";

    if (!inputValue.trim() || !isKeySet || isProcessing) return;

    try {
      const currentXml = await exportDiagram();

      sendMessage(
        { parts: [{ type: "text", text: inputValue }] },
        {
          body: { xml: currentXml },
          headers: {
            "X-Encrypted-Api-Key": encryptedKey || "",
            "X-Model-Id": selectedModel,
          },
        }
      );

      setInputValue("");
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const handleClear = () => {
    setMessages([]);
    clearDiagram();
    previousXMLRef.current = "";
  };

  const handleExampleClick = (text: string) => {
    setInputValue(text);
  };

  const isProcessing = status === "streaming" || status === "submitted";

  return (
    <div className="flex flex-col h-full bg-[var(--card)]">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.1286 7H12.433C11.9523 7 11.5634 7.38887 11.5634 7.86957V10.4783C11.5634 10.959 11.1745 11.3478 10.6939 11.3478H2.86957C2.38887 11.3478 2 11.7367 2 12.2174V15.6957C2 16.1763 2.38887 16.5652 2.86957 16.5652H11.5652C12.0459 16.5652 12.4348 16.1763 12.4348 15.6957V13.087C12.4348 12.6063 12.8237 12.2174 13.3043 12.2174H21.1304C21.6111 12.2174 22 11.8285 22 11.3478V7.86957C22 7.38887 21.6111 7 21.1304 7L21.1286 7Z" fill="var(--color-purple-600)"></path></svg>
          <span className="font-semibold text-[var(--foreground)]"></span>
        </div>
        <div className="flex items-center gap-5">
          <ModelSelector value={selectedModel} onChange={setSelectedModel} />
          <button
            onClick={onOpenApiKeyModal}
            className={cn(
              "p-2 rounded-lg transition-colors",
              "hover:bg-[var(--accent)]",
              isKeySet ? "text-green-500" : "text-[var(--muted-foreground)]"
            )}
            title={isKeySet ? "API Key 已设置" : "设置 API Key"}
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={handleClear}
            className="p-2 rounded-lg hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-red-500 transition-colors"
            title="清空对话和图表"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={onTogglePanel}
            className="p-2 rounded-lg hover:bg-[var(--accent)] text-[var(--muted-foreground)] transition-colors"
            title="收起面板"
          >
            <PanelRightClose className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <EmptyState onExampleClick={handleExampleClick} />
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isProcessing && (
              <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">AI 正在思考...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="mx-4 mb-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2 text-red-500 text-sm">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <div className="font-medium mb-1">生成失败</div>
              <div className="text-xs opacity-90">{error.message}</div>
            </div>
            <button
              onClick={() => {
                if (messages.length > 0) {
                  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
                  if (lastUserMessage && lastUserMessage.parts) {
                    const textPart = lastUserMessage.parts.find((p: any) => p.type === 'text');
                    if (textPart && 'text' in textPart) {
                      setInputValue(textPart.text);
                    }
                  }
                }
              }}
              className="px-3 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <div className="p-4 border-t border-[var(--border)]">
        {!isKeySet ? (
          <button
            onClick={onOpenApiKeyModal}
            className={cn(
              "w-full py-3 rounded-lg font-medium transition-all duration-200",
              "bg-gradient-to-r from-blue-500 to-purple-600 text-white",
              "hover:opacity-90"
            )}
          >
            设置 API Key 开始使用
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="描述您想要的图表，如：画一个用户登录流程图..."
              disabled={isProcessing}
              className={cn(
                "flex-1 px-4 py-3 rounded-lg border bg-[var(--background)]",
                "text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
                "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500",
                "transition-all duration-200",
                "disabled:opacity-50"
              )}
            />
            {isProcessing ? (
              <button
                type="button"
                onClick={() => stop()}
                className={cn(
                  "p-3 rounded-lg transition-all duration-200",
                  "bg-red-500 text-white",
                  "hover:bg-red-600 active:scale-95"
                )}
                title="停止生成"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="6" width="12" height="12" strokeWidth="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className={cn(
                  "p-3 rounded-lg transition-all duration-200",
                  "bg-gradient-to-r from-blue-500 to-purple-600 text-white",
                  "hover:opacity-90 active:scale-95",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onExampleClick }: { onExampleClick: (text: string) => void }) {
  const examples = [
    "画一个电商系统的微服务架构图",
    "创建一个企业网络拓扑图，包含核心路由器、交换机、防火墙",
    "设计一个完整的 CI/CD 流程图，从代码提交到生产部署",
    "绘制一个 Kubernetes 集群架构图",
    "画一个用户注册登录的详细流程图",
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-purple-500" />
      </div>
      <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">开始创作图表</h3>
      <p className="text-sm text-[var(--muted-foreground)] mb-6 max-w-[280px]">
        描述您想要的图表，AI 将自动生成专业的 draw.io 格式图表
      </p>
      <div className="grid gap-2 w-full max-w-[280px]">
        {examples.map((text) => (
          <button
            key={text}
            onClick={() => onExampleClick(text)}
            className="p-3 rounded-lg bg-[var(--secondary)] text-left text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  const hasTextContent = message.parts?.some((part: any) => part.type === "text" && part.text);

  return (
    <div className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-start")}>
      {hasTextContent && (
        <div
          className={cn(
            "max-w-[85%] p-3 rounded-2xl whitespace-pre-wrap text-sm",
            isUser
              ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-br-md"
              : "bg-[var(--secondary)] text-[var(--foreground)] rounded-bl-md"
          )}
        >
          {message.parts?.map((part: any, index: number) => {
            if (part.type === "text") {
              return <span key={index}>{part.text}</span>;
            }
            return null;
          })}
        </div>
      )}

      {message.parts?.map((part: any, index: number) => {
        if (part.type?.startsWith("tool-")) {
          return <ToolCallBubble key={`tool-${index}`} part={part} />;
        }
        return null;
      })}
    </div>
  );
}

function ToolCallBubble({ part }: { part: any }) {
  const toolName = part.type?.replace("tool-", "");
  const { state } = part;

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-green-500/10 text-green-600 border border-green-500/20">
      {state === "input-streaming" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : toolName === "display_diagram" ? (
        <FileCode className="w-3 h-3" />
      ) : (
        <Pencil className="w-3 h-3" />
      )}
      <span>
        {state === "input-streaming"
          ? "生成中..."
          : state === "output-available"
          ? toolName === "display_diagram"
            ? "图表已生成"
            : "编辑完成"
          : toolName === "display_diagram"
          ? "生成图表"
          : "编辑图表"}
      </span>
    </div>
  );
}
