"use client";

import { useState, useEffect } from "react";
import { ChangeLogEntry } from "@/lib/types";
import { parseKeymap } from "@/lib/keymap-parser";

// "current" is index -1, changelog entries are 0..n (newest first)
type ActiveSelection = "current" | number;

interface Props {
  entries: ChangeLogEntry[];
  activeKeymap: string;
  repoKeymap: string;
  onRollback: (entryIndex: number) => void;
  onRevertAll: () => void;
  onRevert: (entry: ChangeLogEntry) => void;
  onViewDiff: (entry: ChangeLogEntry) => void;
  onViewCurrentDiff: () => void;
  onPreview: (keymap: string | null) => void;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ChangeLog({ entries, activeKeymap, repoKeymap, onRollback, onRevertAll, onRevert, onViewDiff, onViewCurrentDiff, onPreview }: Props) {
  const [active, setActive] = useState<ActiveSelection>("current");
  const [confirming, setConfirming] = useState(false);
  const [confirmingRevertAll, setConfirmingRevertAll] = useState(false);

  // On mount, show active working state (null = use keymap from page state)
  useEffect(() => {
    onPreview(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Compare two keymaps by parsed bindings (ignores formatting/comments)
  const bindingsMatch = (a: string, b: string): boolean => {
    try {
      const aLayers = parseKeymap(a).layers;
      const bLayers = parseKeymap(b).layers;
      if (aLayers.length !== bLayers.length) return false;
      for (let l = 0; l < aLayers.length; l++) {
        const aBindings = aLayers[l].bindings;
        const bBindings = bLayers[l].bindings;
        if (aBindings.length !== bBindings.length) return false;
        for (let k = 0; k < aBindings.length; k++) {
          if (aBindings[k].raw !== bBindings[k].raw) return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  const uncommittedEntries = entries.filter((e) => !e.committed);
  const oldestUncommitted = uncommittedEntries.length > 0 ? uncommittedEntries[uncommittedEntries.length - 1] : null;

  // Uncommitted: active state differs from the repo file (only if there are uncommitted entries)
  const hasUncommitted = uncommittedEntries.length > 0 && activeKeymap && repoKeymap && !bindingsMatch(activeKeymap, repoKeymap);

  // External drift: repo file changed since we started editing (only check uncommitted entries)
  const isDrifted = oldestUncommitted && repoKeymap && !bindingsMatch(oldestUncommitted.keymapBefore, repoKeymap);

  console.log("[ChangeLog] entries:", entries.length, "uncommitted:", uncommittedEntries.length, "hasUncommitted:", hasUncommitted, "isDrifted:", isDrifted);

  // Out of sync: active state doesn't match the latest uncommitted snap
  const latestUncommitted = uncommittedEntries.length > 0 ? uncommittedEntries[0] : null;
  const isOutOfSync = latestUncommitted && activeKeymap && !bindingsMatch(activeKeymap, latestUncommitted.keymapAfter);

  // Rollback is available when a changelog entry (not "current") is selected
  const canRollback = typeof active === "number";

  const handleCurrentClick = () => {
    setActive("current");
    setConfirming(false);
    onPreview(null); // null = show active working keymap
  };

  const handleSnapClick = (i: number) => {
    if (active === i) {
      // Clicking already-selected snap goes back to current
      handleCurrentClick();
      return;
    }
    setActive(i);
    setConfirming(false);
    onPreview(entries[i].keymapAfter);
  };

  const handleRollback = () => {
    if (typeof active !== "number") return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onRollback(active);
    setActive("current");
    setConfirming(false);
  };

  const handleRevertAll = () => {
    if (!confirmingRevertAll) {
      setConfirmingRevertAll(true);
      return;
    }
    onRevertAll();
    setActive("current");
    setConfirmingRevertAll(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-surface-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-key-text">Change History</h3>
            <p className="text-xs text-key-subtext mt-0.5">
              {entries.length} change{entries.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-1.5">
            {hasUncommitted && !canRollback && (
              <button
                onClick={handleRevertAll}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  confirmingRevertAll
                    ? "bg-red-500/30 text-red-300 border border-red-500/50"
                    : "bg-red-500/10 hover:bg-red-500/20 text-red-400"
                }`}
              >
                {confirmingRevertAll ? "Confirm?" : "Revert All"}
              </button>
            )}
            {canRollback && (
              <>
                <button
                  onClick={() => onRevert(entries[active as number])}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors bg-amber-500/10 hover:bg-amber-500/20 text-amber-400"
                >
                  Revert
                </button>
                <button
                  onClick={handleRollback}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    confirming
                      ? "bg-red-500/30 text-red-300 border border-red-500/50"
                      : "bg-red-500/10 hover:bg-red-500/20 text-red-400"
                  }`}
                >
                  {confirming
                    ? `Roll back & delete ${active} newer snap${active !== 1 ? "s" : ""}?`
                    : "Roll Back"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Current (repo file) — always first */}
        <div
          onClick={handleCurrentClick}
          className={`px-4 py-3 border-b border-surface-3 transition-all cursor-pointer ${
            active === "current"
              ? "bg-accent/10 border-l-2 border-l-accent"
              : "hover:bg-surface-2/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${hasUncommitted ? "bg-amber-400" : "bg-green-400"}`} />
            <p
              className={`text-sm font-medium ${
                active === "current" ? "text-accent-hover" : "text-key-text"
              }`}
            >
              Current
            </p>
            <span className="text-[10px] text-key-subtext ml-auto">
              {hasUncommitted ? "modified" : "synced"}
            </span>
          </div>
        </div>

        {/* Status indicators between Current and snaps */}
        {isDrifted && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-xs text-red-400 flex-1">
              File modified outside editor
            </span>
            <button
              onClick={onViewCurrentDiff}
              className="px-2 py-0.5 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors shrink-0"
            >
              Diff
            </button>
          </div>
        )}
        {hasUncommitted && !isDrifted && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-xs text-amber-400 flex-1">
              Uncommitted changes
            </span>
            <button
              onClick={onViewCurrentDiff}
              className="px-2 py-0.5 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded transition-colors shrink-0"
            >
              Diff
            </button>
          </div>
        )}
        {isOutOfSync && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <span className="text-xs text-red-400 flex-1">
              Active state out of sync with latest snap
            </span>
            <button
              onClick={onViewCurrentDiff}
              className="px-2 py-0.5 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors shrink-0"
            >
              Diff
            </button>
          </div>
        )}

        {/* Changelog entries */}
        {entries.map((entry, i) => {
          const isActive = active === i;
          const isDimmed = typeof active === "number" && i < active;
          const isCommitted = entry.committed;
          const isUncommittedSnap = !isCommitted && hasUncommitted && !isDimmed;

          return (
            <div
              key={entry.id}
              onClick={() => handleSnapClick(i)}
              className={`px-4 py-3 border-b border-surface-3/50 transition-all cursor-pointer ${
                isActive
                  ? "bg-accent/10 border-l-2 border-l-accent"
                  : isDimmed
                    ? "opacity-35"
                    : isUncommittedSnap
                      ? "border-l-2 border-l-amber-400/50 hover:bg-amber-500/5"
                      : isCommitted
                        ? "border-l-2 border-l-green-500/30 hover:bg-surface-2/50"
                        : "hover:bg-surface-2/50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {entry.reverted ? (
                      <svg className="w-3 h-3 text-key-subtext/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                      </svg>
                    ) : isCommitted ? (
                      <svg className="w-3 h-3 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                    <p
                      className={`text-sm truncate ${
                        entry.reverted
                          ? "text-key-subtext/50 line-through"
                          : isActive ? "text-accent-hover font-medium" : "text-key-text"
                      }`}
                    >
                      {isCommitted && entry.commitName ? entry.commitName : entry.description}
                    </p>
                  </div>
                  <p className="text-xs text-key-subtext mt-0.5">
                    {timeAgo(entry.timestamp)}
                    {entry.reverted && <span className="ml-1.5 text-key-subtext/50">reverted</span>}
                    {isCommitted && !entry.reverted && <span className="ml-1.5 text-green-400/60">committed</span>}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDiff(entry);
                  }}
                  className="px-2 py-1 text-xs bg-surface-3 hover:bg-surface-3/80 text-key-subtext hover:text-key-text rounded transition-colors shrink-0"
                  title="View diff"
                >
                  Diff
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
