"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { startGeneration, sendFeedback } from "@/app/lib/sse";
import { StreamEvent } from "@/app/types/stream";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface Thread {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
}

export default function BlogGenerator() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamController, setStreamController] =
    useState<{ abort: () => void } | null>(null);

  const currentThreadIdRef = useRef<string | null>(null);
  const buildingAssistantMessageRef = useRef<boolean>(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ================= LOAD THREADS =================
  useEffect(() => {
    const saved = localStorage.getItem("blog_threads");
    if (saved) {
      try {
        setThreads(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse threads", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("blog_threads", JSON.stringify(threads));
  }, [threads]);

  // ================= AUTO SCROLL =================
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, loading]);

  const currentThread = threads.find((t) => t.id === currentThreadId);

  // ================= NEW CHAT =================
  const handleNewChat = () => {
    if (streamController) {
      streamController.abort();
      setStreamController(null);
    }
    setCurrentThreadId(null);
    currentThreadIdRef.current = null;
    setInputValue("");
    setLoading(false);
    buildingAssistantMessageRef.current = false;
  };

  // ================= APPEND ASSISTANT MESSAGE =================
  const appendAssistantMessage = (content?: string) => {
    if (!content) return;

    setThreads((prev) => {
      const thread = prev.find(
        (t) => t.id === currentThreadIdRef.current
      );
      if (!thread) return prev;

      const lastMsg = thread.messages[thread.messages.length - 1];

      if (
        buildingAssistantMessageRef.current &&
        lastMsg?.role === "assistant"
      ) {
        const updatedMessages = [...thread.messages];
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + content,
        };

        return prev.map((t) =>
          t.id === currentThreadIdRef.current
            ? { ...t, messages: updatedMessages }
            : t
        );
      }

      buildingAssistantMessageRef.current = true;

      return prev.map((t) =>
        t.id === currentThreadIdRef.current
          ? {
            ...t,
            messages: [
              ...t.messages,
              {
                role: "assistant",
                content,
                timestamp: Date.now(),
              },
            ],
          }
          : t
      );
    });
  };

  const finishStreaming = () => {
    buildingAssistantMessageRef.current = false;
    setLoading(false);
    setStreamController(null);
  };

  // ================= SEND MESSAGE =================
  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;

    buildingAssistantMessageRef.current = false;

    const userMessage: Message = {
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
    };

    setLoading(true);

    // ========== NEW THREAD ==========
    if (!currentThreadId) {
      try {
        const controller = await startGeneration(
          inputValue,
          (event: StreamEvent) => {
            if (event.type === "thread_id") {
              const threadId = event.thread_id;
              if (!threadId) return;

              const newThread: Thread = {
                id: threadId,
                title:
                  inputValue.slice(0, 30) +
                  (inputValue.length > 30 ? "..." : ""),
                createdAt: Date.now(),
                messages: [userMessage],
              };

              setThreads((prev) => [newThread, ...prev]);
              setCurrentThreadId(threadId);
              currentThreadIdRef.current = threadId;
            }

            if (event.type === "section") {
              appendAssistantMessage(event.content);
            }

            if (event.type === "done") {
              finishStreaming();
            }
          },
          finishStreaming
        );

        setStreamController(controller);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    }

    // ========== EXISTING THREAD ==========
    else {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === currentThreadId
            ? { ...t, messages: [...t.messages, userMessage] }
            : t
        )
      );

      try {
        const controller = await sendFeedback(
          currentThreadId,
          inputValue,
          (event: StreamEvent) => {
            if (event.type === "section") {
              appendAssistantMessage(event.content);
            }

            if (event.type === "done") {
              finishStreaming();
            }
          },
          finishStreaming
        );

        setStreamController(controller);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    }

    setInputValue("");
  };

  // ================= SELECT THREAD =================
  const handleSelectThread = (threadId: string) => {
    if (streamController) {
      streamController.abort();
      setStreamController(null);
    }
    setCurrentThreadId(threadId);
    currentThreadIdRef.current = threadId;
    setLoading(false);
    setInputValue("");
    buildingAssistantMessageRef.current = false;
  };

  // ================= DELETE THREAD =================
  const handleDeleteThread = (
    threadId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (currentThreadId === threadId) {
      setCurrentThreadId(null);
      currentThreadIdRef.current = null;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* ================= SIDEBAR ================= */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <button
          onClick={handleNewChat}
          className="m-4 p-3 border border-gray-700 rounded-lg hover:bg-gray-800 transition"
        >
          + New Chat
        </button>

        <div className="flex-1 overflow-y-auto px-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className={`p-3 mb-1 rounded-lg cursor-pointer flex justify-between items-center ${currentThreadId === thread.id
                ? "bg-gray-700"
                : "hover:bg-gray-800"
                }`}
            >
              <span className="truncate text-sm">
                {thread.title}
              </span>
              <button
                onClick={(e) =>
                  handleDeleteThread(thread.id, e)
                }
                className="text-red-400 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ================= CHAT AREA ================= */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {currentThread?.messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user"
                  ? "justify-end"
                  : "justify-start"
                  }`}
              >
                <div
                  className={`rounded-3xl px-6 py-4 max-w-[85%] ${msg.role === "user"
                    ? "bg-black text-white"
                    : "bg-white border border-gray-100 shadow-lg"
                    }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-3xl font-bold mt-10 mb-6 text-gray-900">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 border-b pb-2">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-xl font-semibold mt-6 mb-3 text-gray-800">
                            {children}
                          </h3>
                        ),
                        p: ({ children }) => (
                          <p className="text-gray-700 leading-relaxed my-3 text-[15px]">
                            {children}
                          </p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-6 space-y-2 my-4 text-gray-700">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal pl-6 space-y-2 my-4 text-gray-700">
                            {children}
                          </ol>
                        ),
                        li: ({ children }) => (
                          <li className="leading-relaxed text-[15px]">
                            {children}
                          </li>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-semibold text-gray-900">
                            {children}
                          </strong>
                        ),
                        a: ({ href, children }) => (
                          <a
                            href={href}
                            target="_blank"
                            className="text-blue-600 hover:text-blue-800 underline transition"
                          >
                            {children}
                          </a>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600 my-4">
                            {children}
                          </blockquote>
                        ),
                        code: ({ children }) => (
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="text-gray-500">
                AI is typing...
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ================= INPUT ================= */}
        <div className="border-t bg-white p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              rows={1}
              value={inputValue}
              onChange={(e) =>
                setInputValue(e.target.value)
              }
              placeholder="Type your message..."
              className="flex-1 border rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-black"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            <button
              onClick={handleSend}
              disabled={loading || !inputValue.trim()}
              className="bg-black text-white px-6 py-3 rounded-xl disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}