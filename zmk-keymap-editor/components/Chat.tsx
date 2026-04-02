"use client";

import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  onCancel?: () => void;
  isLoading: boolean;
}

export interface ChatHandle {
  insertText: (text: string) => void;
}

function TypingIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-surface-2/50 rounded-xl mx-1">
      <div className="flex gap-1">
        <div className="typing-dot w-2 h-2 rounded-full bg-accent" />
        <div className="typing-dot w-2 h-2 rounded-full bg-accent" />
        <div className="typing-dot w-2 h-2 rounded-full bg-accent" />
      </div>
      <span className="text-xs text-key-subtext">
        Claude is thinking...
        {elapsed >= 5 && (
          <span className="ml-1 text-key-subtext/60">{elapsed}s</span>
        )}
      </span>
    </div>
  );
}

function renderMarkdown(text: string): string {
  // Strip keymap code blocks from display (they're handled by the system)
  let cleaned = text.replace(/```keymap\n[\s\S]*?```/g, "");

  // Basic markdown rendering
  cleaned = cleaned
    // Code blocks
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre><code class="language-$1">$2</code></pre>'
    )
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Paragraphs (double newline)
    .replace(/\n\n/g, "</p><p>")
    // Single newlines
    .replace(/\n/g, "<br>");

  // Wrap list items
  cleaned = cleaned.replace(
    /(<li>[\s\S]*<\/li>)/g,
    "<ul>$1</ul>"
  );

  return `<p>${cleaned}</p>`;
}

const Chat = forwardRef<ChatHandle, Props>(function Chat({ messages, onSend, onCancel, isLoading }, ref) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      setInput((prev) => {
        const before = prev;
        const textarea = inputRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const newVal = before.slice(0, start) + text + before.slice(end);
          // Set cursor position after insert on next tick
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + text.length;
            textarea.focus();
          }, 0);
          return newVal;
        }
        return before + text;
      });
      inputRef.current?.focus();
    },
  }));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-key-subtext text-sm gap-2">
            <svg
              className="w-8 h-8 opacity-40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p>Start chatting to modify your keymap</p>
            <p className="text-xs opacity-60">
              Try: &quot;Add a media layer&quot; or &quot;Make Caps Lock a
              Ctrl/Esc key&quot;
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent text-white rounded-br-md"
                  : "bg-surface-2 text-key-text rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <div
                  className="chat-content"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(msg.content),
                  }}
                />
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
              {msg.keymapSnapshot && msg.role === "assistant" && (
                <div className="mt-2 pt-2 border-t border-white/10 text-xs text-accent-hover">
                  Keymap updated
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-surface-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your keymap changes..."
            rows={1}
            className="flex-1 bg-surface-2 border border-surface-3 rounded-lg px-3 py-2.5 text-sm text-key-text placeholder:text-key-subtext focus:outline-none focus:border-accent resize-none"
            style={{ minHeight: "42px", maxHeight: "120px" }}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 bg-red-500/80 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-key-subtext text-white rounded-lg text-sm font-medium transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

export default Chat;
