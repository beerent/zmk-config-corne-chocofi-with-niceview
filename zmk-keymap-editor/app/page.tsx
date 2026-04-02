"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { parseKeymap } from "@/lib/keymap-parser";
import { ChatMessage, ChangeLogEntry, AppSettings } from "@/lib/types";
import KeyboardVisualizer from "@/components/KeyboardVisualizer";
import Chat, { ChatHandle } from "@/components/Chat";
import ChangeLog from "@/components/ChangeLog";
import DiffView from "@/components/DiffView";
import BuildMonitor from "@/components/BuildMonitor";
import Settings from "@/components/Settings";

const DEFAULT_SETTINGS: AppSettings = {
  repoConfig: {
    owner: "",
    repo: "",
    branch: "main",
    keymapPath: "config/corne.keymap",
  },
};

interface AuthStatus {
  github: { authenticated: boolean; username: string | null };
  claude: { configured: boolean };
}

type RightPanel = "changelog" | "builds";

export default function Home() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [keymap, setKeymap] = useState<string>("");
  const [repoKeymap, setRepoKeymap] = useState<string>("");
  const [fileSha, setFileSha] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [changeLog, setChangeLogRaw] = useState<ChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRepoLoading, setIsRepoLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState(0);
  const [changedKeys, setChangedKeys] = useState<Set<number>>(new Set());
  const [diffEntry, setDiffEntry] = useState<ChangeLogEntry | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>("changelog");
  const [lastCommitSha, setLastCommitSha] = useState<string | null>(null);
  const [commitPending, setCommitPending] = useState(false);
  const [previewKeymap, setPreviewKeymap] = useState<string | null>(null);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const chatRef = useRef<ChatHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const revertingEntryRef = useRef<string | null>(null);

  // Check auth status and auto-detect repo on mount
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => setAuthStatus(data));

    // Auto-detect repo from git remote
    fetch("/api/repo/detect")
      .then((r) => r.json())
      .then((data) => {
        if (data.owner && data.repo) {
          const detected: AppSettings = {
            repoConfig: {
              owner: data.owner,
              repo: data.repo,
              branch: data.branch || "main",
              keymapPath: data.keymapPath || "config/corne.keymap",
            },
          };
          setSettings(detected);
          localStorage.setItem("zmk-editor-settings", JSON.stringify(detected));
        } else {
          // Fallback to saved settings
          const saved = localStorage.getItem("zmk-editor-settings");
          if (saved) {
            setSettings(JSON.parse(saved));
          } else {
            setShowSettings(true);
          }
        }
      })
      .catch(() => {
        const saved = localStorage.getItem("zmk-editor-settings");
        if (saved) {
          setSettings(JSON.parse(saved));
        } else {
          setShowSettings(true);
        }
      });

  }, []);

  // Load changelog from local file on mount
  useEffect(() => {
    fetch("/api/changelog")
      .then((r) => r.json())
      .then((data) => {
        if (data.entries && data.entries.length > 0) {
          setChangeLogRaw(data.entries);
        }
      })
      .catch(() => {});
  }, []);

  // Wrapper: every setChangeLog call also persists to local file
  const setChangeLog = useCallback((update: ChangeLogEntry[] | ((prev: ChangeLogEntry[]) => ChangeLogEntry[])) => {
    setChangeLogRaw((prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      // Fire-and-forget persist
      fetch("/api/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  const saveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("zmk-editor-settings", JSON.stringify(newSettings));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthStatus((prev) =>
      prev
        ? { ...prev, github: { authenticated: false, username: null } }
        : null
    );
  };

  const loadRepo = useCallback(async () => {
    setIsRepoLoading(true);
    try {
      const params = new URLSearchParams({
        owner: settings.repoConfig.owner,
        repo: settings.repoConfig.repo,
        path: settings.repoConfig.keymapPath,
        branch: settings.repoConfig.branch,
      });

      const res = await fetch(`/api/github?${params}`);
      if (res.status === 401) {
        window.location.href = "/api/auth/github";
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch keymap");

      const data = await res.json();
      setFileSha(data.sha);
      setRepoKeymap(data.content);
      setShowSettings(false);

      // Changelog is loaded from local file on mount — no need to load from GitHub

      setKeymap(data.content);
    } catch (err) {
      alert(
        `Failed to load repo: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      setIsRepoLoading(false);
    }
  }, [settings]);

  // Auto-load keymap when auth + repo are ready
  useEffect(() => {
    if (
      authStatus?.github.authenticated &&
      settings.repoConfig.owner &&
      !keymap &&
      !isRepoLoading
    ) {
      loadRepo();
    }
  }, [authStatus, settings, keymap, isRepoLoading, loadRepo]);

  const computeChangedKeys = (oldKeymap: string, newKeymap: string) => {
    try {
      const oldParsed = parseKeymap(oldKeymap);
      const newParsed = parseKeymap(newKeymap);
      const changed = new Set<number>();

      for (let l = 0; l < newParsed.layers.length; l++) {
        if (l !== activeLayer) continue;
        const oldLayer = oldParsed.layers[l];
        const newLayer = newParsed.layers[l];
        if (!oldLayer || !newLayer) continue;

        for (let k = 0; k < newLayer.bindings.length; k++) {
          const oldBinding = oldLayer.bindings[k];
          if (!oldBinding || oldBinding.raw !== newLayer.bindings[k].raw) {
            changed.add(k);
          }
        }
      }

      return changed;
    } catch {
      return new Set<number>();
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!authStatus?.claude.configured) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content:
          "Claude API key is not configured. Add ANTHROPIC_API_KEY to your .env.local file and restart the server.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const assistantMsgId = `msg-${Date.now() + 1}`;

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          currentKeymap: keymap,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Chat request failed");

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const textContent = data.content;
      const newKeymap = data.newKeymap || null;

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: textContent,
        timestamp: Date.now(),
        keymapSnapshot: newKeymap || undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (newKeymap) {
        const oldKeymap = keymap;
        setKeymap(newKeymap);

        const changed = computeChangedKeys(oldKeymap, newKeymap);
        setChangedKeys(changed);

        const logEntry: ChangeLogEntry = {
          id: `change-${Date.now()}`,
          timestamp: Date.now(),
          description: content.slice(0, 100),
          keymapBefore: oldKeymap,
          keymapAfter: newKeymap,
          messageId: assistantMsgId,
        };
        setChangeLog((prev) => [logEntry, ...prev]);

        // Check if this was a successful revert
        if (revertingEntryRef.current) {
          const revertId = revertingEntryRef.current;
          revertingEntryRef.current = null;
          try {
            const newLayers = parseKeymap(newKeymap).layers;
            setChangeLog((prev) => {
              const target = prev.find((e) => e.id === revertId);
              if (!target) return prev;
              // Check if the bindings that were changed are now back to keymapBefore state
              const beforeLayers = parseKeymap(target.keymapBefore).layers;
              const afterLayers = parseKeymap(target.keymapAfter).layers;
              let revertedCount = 0;
              let changedCount = 0;
              for (let l = 0; l < afterLayers.length && l < beforeLayers.length; l++) {
                for (let k = 0; k < afterLayers[l].bindings.length; k++) {
                  if (afterLayers[l].bindings[k].raw !== beforeLayers[l].bindings[k].raw) {
                    changedCount++;
                    if (newLayers[l]?.bindings[k]?.raw === beforeLayers[l].bindings[k].raw) {
                      revertedCount++;
                    }
                  }
                }
              }
              if (changedCount > 0 && revertedCount === changedCount) {
                return prev.map((e) => e.id === revertId ? { ...e, reverted: true } : e);
              }
              return prev;
            });
          } catch {
            // Parse error — skip revert detection
          }
        }

        setCommitPending(true);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const cancelMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: "Request cancelled.",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, cancelMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Kill the server-side Claude process
    fetch("/api/chat", { method: "DELETE" }).catch(() => {});
    // Abort the client-side fetch
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  const handleRollback = (entryIndex: number) => {
    const entry = changeLog[entryIndex];
    if (!entry) return;
    setKeymap(entry.keymapAfter);
    setChangeLog((prev) => prev.slice(entryIndex));
    setPreviewKeymap(null);
    setChangedKeys(new Set());
    setCommitPending(true);
  };

  const handleRevertAll = () => {
    setKeymap(repoKeymap);
    setChangeLog([]);
    setPreviewKeymap(null);
    setChangedKeys(new Set());
    setCommitPending(false);
  };

  const openCommitModal = () => {
    const defaultMsg = changeLog.length <= 1
      ? changeLog[0]?.description || "Update keymap"
      : `${changeLog.length} changes: ${changeLog.slice().reverse().map((e) => e.description).join(", ")}`;
    setCommitMessage(defaultMsg);
    setShowCommitModal(true);
  };

  const handleCommit = async () => {
    if (!keymap || !fileSha) return;
    setShowCommitModal(false);

    // Mark all uncommitted entries as committed with the commit message as their name
    const commitName = commitMessage || "Update keymap";
    const newChangeLog = changeLog.map((e) =>
      e.committed ? e : { ...e, committed: true, commitName }
    );

    try {
      setIsLoading(true);
      const res = await fetch("/api/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: settings.repoConfig.owner,
          repo: settings.repoConfig.repo,
          keymapPath: settings.repoConfig.keymapPath,
          branch: settings.repoConfig.branch,
          content: keymap,
          message: commitMessage || "Update keymap",
          changelog: newChangeLog,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/api/auth/github";
        return;
      }
      if (!res.ok) throw new Error("Commit failed");

      const data = await res.json();
      setFileSha(data.sha);
      setRepoKeymap(keymap);
      setLastCommitSha(data.commitSha);
      setCommitPending(false);
      setChangeLog(newChangeLog);

      setChangedKeys(new Set());
      setPreviewKeymap(null);
      setRightPanel("builds");
    } catch (err) {
      alert(`Commit failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyClick = (layerName: string, keyLabel: string, binding: string, side: "left" | "right", position: { row: number; col: number; index: number; isThumb: boolean }) => {
    const posLabel = position.isThumb ? `thumb${position.col + 1}` : `R${position.row}C${position.col}`;
    const tag = `[${layerName}, ${side} ${posLabel}, binding #${position.index}: ${keyLabel || binding}]`;
    chatRef.current?.insertText(tag + " ");
  };

  const handleRevert = (entry: ChangeLogEntry) => {
    revertingEntryRef.current = entry.id;
    const prompt = `I want to revert the change "${entry.description}". This change modified the keymap from:\n\n\`\`\`\n${entry.keymapBefore}\n\`\`\`\n\nto:\n\n\`\`\`\n${entry.keymapAfter}\n\`\`\`\n\nPlease undo this specific change, but check that reverting it won't break any other bindings, layers, or behaviors that may depend on it. If there are conflicts, explain them and suggest the safest way to revert.`;
    chatRef.current?.insertText(prompt);
  };

  const displayKeymap = previewKeymap || keymap;
  let parsedLayers: ReturnType<typeof parseKeymap>["layers"] = [];
  try {
    parsedLayers = displayKeymap ? parseKeymap(displayKeymap).layers : [];
  } catch {
    parsedLayers = [];
  }

  const githubAuthed = authStatus?.github.authenticated;
  const claudeConfigured = authStatus?.claude.configured;

  return (
    <div className="h-screen flex flex-col bg-surface-0">
      {/* Header */}
      <header className="h-12 border-b border-surface-3 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-key-text tracking-wide">
            ZMK Keymap Editor
          </h1>
          {settings.repoConfig.owner && (
            <span className="text-xs text-key-subtext bg-surface-2 px-2 py-0.5 rounded">
              {settings.repoConfig.owner}/{settings.repoConfig.repo}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Auth status indicators */}
          {authStatus && (
            <div className="flex items-center gap-2 mr-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={`w-2 h-2 rounded-full ${claudeConfigured ? "bg-green-400" : "bg-red-400"}`}
                />
                <span className="text-key-subtext">Claude</span>
              </div>
              {githubAuthed ? (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-key-subtext">
                    {authStatus.github.username}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-key-subtext hover:text-red-400 transition-colors ml-0.5"
                    title="Sign out"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <a
                  href="/api/auth/github"
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-surface-2 hover:bg-surface-3 text-key-text text-xs rounded-md transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  Sign in with GitHub
                </a>
              )}
            </div>
          )}

          {commitPending && (
            <button
              onClick={openCommitModal}
              disabled={isLoading || !githubAuthed}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Commit & Build
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-key-subtext hover:text-key-text"
            title="Settings"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Chat */}
        <div className="w-[380px] border-r border-surface-3 flex flex-col shrink-0">
          <Chat
            ref={chatRef}
            messages={messages}
            onSend={handleSendMessage}
            onCancel={handleCancel}
            isLoading={isLoading}
          />
        </div>

        {/* Center: Keyboard Visualizer */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            {parsedLayers.length > 0 ? (
              <KeyboardVisualizer
                layers={parsedLayers}
                activeLayer={activeLayer}
                onLayerChange={setActiveLayer}
                onKeyClick={handleKeyClick}
                changedKeys={changedKeys}
              />
            ) : (
              <div className="text-center text-key-subtext">
                {!githubAuthed ? (
                  <>
                    <p className="text-sm">Sign in with GitHub to get started</p>
                    <a
                      href="/api/auth/github"
                      className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-surface-2 hover:bg-surface-3 text-key-text text-sm rounded-lg transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                      </svg>
                      Sign in with GitHub
                    </a>
                  </>
                ) : (
                  <>
                    <p className="text-sm">No keymap loaded</p>
                    <p className="text-xs mt-1 opacity-60">
                      Configure your repo in settings to get started
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Raw keymap viewer */}
          {keymap && (
            <div className="h-48 border-t border-surface-3 overflow-auto">
              <div className="px-4 py-2 border-b border-surface-3/50 bg-surface-1 sticky top-0 flex items-center gap-2">
                <span className="text-xs font-medium text-key-subtext">
                  corne.keymap
                </span>
                {previewKeymap && (
                  <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                    previewing snap
                  </span>
                )}
              </div>
              <pre className="text-xs font-mono text-key-subtext p-4 leading-relaxed">
                {displayKeymap}
              </pre>
            </div>
          )}
        </div>

        {/* Right: Changelog / Builds */}
        <div className="w-[280px] border-l border-surface-3 flex flex-col shrink-0">
          {/* Tab switcher */}
          <div className="flex border-b border-surface-3">
            <button
              onClick={() => setRightPanel("changelog")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                rightPanel === "changelog"
                  ? "text-accent border-b-2 border-accent"
                  : "text-key-subtext hover:text-key-text"
              }`}
            >
              Changes
              {changeLog.length > 0 && (
                <span className="ml-1.5 bg-surface-3 text-key-subtext px-1.5 py-0.5 rounded-full text-[10px]">
                  {changeLog.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setRightPanel("builds")}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                rightPanel === "builds"
                  ? "text-accent border-b-2 border-accent"
                  : "text-key-subtext hover:text-key-text"
              }`}
            >
              Builds
            </button>
          </div>

          {rightPanel === "changelog" ? (
            <ChangeLog
              entries={changeLog}
              activeKeymap={keymap}
              repoKeymap={repoKeymap}
              onRollback={handleRollback}
              onRevertAll={handleRevertAll}
              onRevert={handleRevert}
              onViewDiff={setDiffEntry}
              onViewCurrentDiff={() => setDiffEntry({
                id: "current-diff",
                timestamp: Date.now(),
                description: "Current vs repo",
                keymapBefore: repoKeymap,
                keymapAfter: keymap,
                messageId: "",
              })}
              onPreview={setPreviewKeymap}
            />
          ) : (
            <BuildMonitor
              settings={settings}
              lastCommitSha={lastCommitSha}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showSettings && (
        <Settings
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
          onLoadRepo={loadRepo}
          isLoading={isRepoLoading}
        />
      )}

      {diffEntry && (
        <DiffView
          before={diffEntry.keymapBefore}
          after={diffEntry.keymapAfter}
          onClose={() => setDiffEntry(null)}
        />
      )}

      {showCommitModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface-1 border border-surface-3 rounded-xl w-[420px] p-5">
            <h3 className="text-sm font-semibold text-key-text mb-1">Commit & Build</h3>
            <p className="text-xs text-key-subtext mb-3">
              {changeLog.filter(e => !e.committed).length} uncommitted change{changeLog.filter(e => !e.committed).length !== 1 ? "s" : ""} will be committed.
            </p>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && commitMessage.trim()) handleCommit(); }}
              placeholder="Commit message..."
              autoFocus
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2.5 text-sm text-key-text placeholder:text-key-subtext focus:outline-none focus:border-accent"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowCommitModal(false)}
                className="px-3 py-1.5 text-xs text-key-subtext hover:text-key-text bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim()}
                className="px-4 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-500 disabled:bg-surface-3 disabled:text-key-subtext rounded-lg transition-colors"
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
