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
  const [streamController, setStreamController] = useState<{ abort: () => void } | null>(null);

  const currentThreadIdRef = useRef<string | null>(null);
  const buildingAssistantMessageRef = useRef<boolean>(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load threads from localStorage
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

  // Auto‑scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, loading]);

  const currentThread = threads.find((t) => t.id === currentThreadId);

  // New chat
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

  // Append assistant message (streaming)
  const appendAssistantMessage = (content?: string) => {
    if (!content) return;

    setThreads((prev) => {
      const thread = prev.find((t) => t.id === currentThreadIdRef.current);
      if (!thread) return prev;

      const lastMsg = thread.messages[thread.messages.length - 1];

      if (buildingAssistantMessageRef.current && lastMsg?.role === "assistant") {
        const updatedMessages = [...thread.messages];
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + content,
        };
        return prev.map((t) =>
          t.id === currentThreadIdRef.current ? { ...t, messages: updatedMessages } : t
        );
      }

      buildingAssistantMessageRef.current = true;
      return prev.map((t) =>
        t.id === currentThreadIdRef.current
          ? {
              ...t,
              messages: [
                ...t.messages,
                { role: "assistant", content, timestamp: Date.now() },
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

  // Send message
  const handleSend = async () => {
    if (!inputValue.trim() || loading) return;

    buildingAssistantMessageRef.current = false;
    const userMessage: Message = {
      role: "user",
      content: inputValue,
      timestamp: Date.now(),
    };

    setLoading(true);

    // New thread
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
                title: inputValue.slice(0, 30) + (inputValue.length > 30 ? "..." : ""),
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
    // Existing thread
    else {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === currentThreadId ? { ...t, messages: [...t.messages, userMessage] } : t
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

  // Select thread
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

  // Delete thread
  const handleDeleteThread = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (currentThreadId === threadId) {
      setCurrentThreadId(null);
      currentThreadIdRef.current = null;
    }
  };

  // Example prompts for empty state
  const examplePrompts = [
    "Create a beginner-friendly blog about MERN stack development",
    "Generate a blog post on the importance of cybersecurity in 2026",
    "Write an SEO-friendly blog on fitness tips for busy professionals",
    "Write a blog on how students can start freelancing",
  ];

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black font-sans text-gray-200">
      {/* Sidebar */}
      <div className="w-72 flex flex-col bg-gray-900/80 backdrop-blur-md border-r border-gray-800 shadow-2xl">
        <button
          onClick={handleNewChat}
          className="mx-4 mt-6 mb-4 p-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-2xl font-medium hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>

        <div className="flex-1 overflow-y-auto px-3 space-y-1.5">
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className={`group p-3 rounded-xl cursor-pointer flex justify-between items-center transition-all duration-150 ${
                currentThreadId === thread.id
                  ? "bg-gray-800/80 border border-gray-700"
                  : "hover:bg-gray-800/50"
              }`}
            >
              <span className="truncate text-sm font-medium text-gray-300">{thread.title}</span>
              <button
                onClick={(e) => handleDeleteThread(thread.id, e)}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition text-sm p-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          {currentThread ? (
            <div className="max-w-4xl mx-auto space-y-6">
              {currentThread.messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-2xl px-5 py-4 max-w-[85%] shadow-sm transition-all ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-br-none"
                        : "bg-gray-800/80 backdrop-blur-sm border border-gray-700 text-gray-200 rounded-bl-none"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => (
                            <h1 className="text-2xl font-bold mt-6 mb-4 text-white">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-xl font-bold mt-5 mb-3 text-gray-100 border-b border-gray-700 pb-1">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-200">{children}</h3>
                          ),
                          p: ({ children }) => (
                            <p className="text-gray-300 leading-relaxed my-2 text-[15px]">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc pl-5 space-y-1 my-3 text-gray-300">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal pl-5 space-y-1 my-3 text-gray-300">{children}</ol>
                          ),
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          strong: ({ children }) => (
                            <strong className="font-semibold text-white">{children}</strong>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              className="text-blue-400 hover:text-blue-300 underline transition"
                            >
                              {children}
                            </a>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-4 border-gray-600 pl-4 italic text-gray-400 my-3">
                              {children}
                            </blockquote>
                          ),
                          code: ({ children }) => (
                            <code className="bg-gray-700 px-2 py-1 rounded text-sm font-mono text-gray-200">
                              {children}
                            </code>
                          ),
                          pre: ({ children }) => (
                            <pre className="bg-gray-900 p-3 rounded-lg overflow-x-auto text-sm font-mono text-gray-200 border border-gray-700">
                              {children}
                            </pre>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl rounded-bl-none px-5 py-4 shadow-sm">
                    <div className="flex space-x-1.5">
                      <div className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse"></div>
                      <div className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse delay-150"></div>
                      <div className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-pulse delay-300"></div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          ) : (
            // Empty state – centered input with example prompts
            <div className="h-full flex flex-col items-center justify-center px-4">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-3">
                INKGENIE
              </h1>
              <p className="text-gray-400 mb-8 text-center max-w-md">
                Describe your topic, audience, and tone to generate a complete blog instantly.
              </p>

              {/* Big input */}
              <div className="w-full max-w-2xl">
                <div className="relative group">
                  <textarea
                    rows={1}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="What Do You Want to Write Today?"
                    className="w-full px-6 py-5 bg-gray-800/70 backdrop-blur-xl border border-gray-700 rounded-2xl shadow-xl shadow-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none text-lg text-white placeholder-gray-400"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white p-3 rounded-xl disabled:opacity-50 hover:shadow-lg transition-all"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>

                {/* Example prompts */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {examplePrompts.map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInputValue(prompt)}
                      className="text-left px-4 py-2.5 bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl text-sm text-gray-300 hover:bg-gray-800/80 hover:border-gray-600 transition"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input bar (only when a thread is active) */}
        {currentThread && (
          <div className="border-t border-gray-800 bg-gray-900/50 backdrop-blur-xl p-4">
            <div className="max-w-4xl mx-auto flex gap-3">
              <textarea
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-5 py-4 bg-gray-800/70 border border-gray-700 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm text-white placeholder-gray-400"
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
                className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-4 rounded-xl disabled:opacity-50 hover:shadow-lg transition-all"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}