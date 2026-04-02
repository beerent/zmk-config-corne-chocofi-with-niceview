"use client";

import { useState } from "react";
import { AppSettings, RepoConfig } from "@/lib/types";

interface Props {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
  onLoadRepo: () => void;
  isLoading: boolean;
}

function parseRepoUrl(url: string): Partial<RepoConfig> {
  const match = url.match(
    /(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)(?:\.git)?$/
  );
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return {};
}

export default function Settings({
  settings,
  onSave,
  onClose,
  onLoadRepo,
  isLoading,
}: Props) {
  const [form, setForm] = useState(settings);
  const [repoUrl, setRepoUrl] = useState(
    settings.repoConfig.owner
      ? `${settings.repoConfig.owner}/${settings.repoConfig.repo}`
      : ""
  );

  const handleRepoUrlChange = (url: string) => {
    setRepoUrl(url);
    const parsed = parseRepoUrl(url);
    if (parsed.owner && parsed.repo) {
      setForm((f) => ({
        ...f,
        repoConfig: { ...f.repoConfig, ...parsed },
      }));
    }
  };

  const handleSave = () => {
    onSave(form);
  };

  const handleSaveAndLoad = () => {
    onSave(form);
    onLoadRepo();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-1 rounded-xl border border-surface-3 max-w-lg w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-3">
          <h2 className="text-base font-semibold text-key-text">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-key-subtext hover:text-key-text"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="bg-surface-2/50 rounded-lg px-3 py-2 text-xs text-key-subtext">
            API keys are configured server-side via <code className="bg-surface-3 px-1 rounded">.env.local</code>
          </div>

          {/* Repository */}
          <div>
            <label className="block text-sm font-medium text-key-text mb-1.5">
              GitHub Repository
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => handleRepoUrlChange(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-key-text placeholder:text-key-subtext focus:outline-none focus:border-accent"
            />
          </div>

          {/* Branch & Path */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-key-text mb-1.5">
                Branch
              </label>
              <input
                type="text"
                value={form.repoConfig.branch}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    repoConfig: { ...f.repoConfig, branch: e.target.value },
                  }))
                }
                className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-key-text focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-key-text mb-1.5">
                Keymap Path
              </label>
              <input
                type="text"
                value={form.repoConfig.keymapPath}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    repoConfig: {
                      ...f.repoConfig,
                      keymapPath: e.target.value,
                    },
                  }))
                }
                className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-key-text focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-surface-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-surface-3 hover:bg-surface-3/80 text-key-text rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
          <button
            onClick={handleSaveAndLoad}
            disabled={isLoading || !form.repoConfig.owner}
            className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:bg-surface-3 disabled:text-key-subtext text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? "Loading..." : "Save & Load Repo"}
          </button>
        </div>
      </div>
    </div>
  );
}
