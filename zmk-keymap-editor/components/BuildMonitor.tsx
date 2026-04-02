"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppSettings } from "@/lib/types";

interface BuildRun {
  id: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  headSha: string;
  artifacts: { id: number; name: string; size_in_bytes: number }[];
}

type InstallStep =
  | "idle"
  | "preparing"
  | "waiting-left"
  | "flashing-left"
  | "waiting-right"
  | "flashing-right"
  | "complete"
  | "error";

interface InstallState {
  step: InstallStep;
  firmwareDir: string | null;
  leftFile: string | null;
  rightFile: string | null;
  error: string | null;
}

interface Props {
  settings: AppSettings;
  lastCommitSha: string | null;
}

export default function BuildMonitor({ settings, lastCommitSha }: Props) {
  const [runs, setRuns] = useState<BuildRun[]>([]);
  const [polling, setPolling] = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [install, setInstall] = useState<InstallState>({
    step: "idle",
    firmwareDir: null,
    leftFile: null,
    rightFile: null,
    error: null,
  });
  const detectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!settings.repoConfig.owner) return;

    const params = new URLSearchParams({
      owner: settings.repoConfig.owner,
      repo: settings.repoConfig.repo,
      branch: settings.repoConfig.branch,
    });

    const res = await fetch(`/api/github/build-status?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRuns(data.runs);
    }
  }, [settings]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useEffect(() => {
    if (!lastCommitSha) return;

    const hasPending = runs.some(
      (r) =>
        r.headSha.startsWith(lastCommitSha.slice(0, 7)) &&
        r.status !== "completed"
    );

    if (hasPending || (lastCommitSha && runs.length === 0)) {
      setPolling(true);
      const interval = setInterval(fetchRuns, 10000);
      return () => {
        clearInterval(interval);
        setPolling(false);
      };
    } else {
      setPolling(false);
    }
  }, [runs, lastCommitSha, fetchRuns]);

  const handleDownload = async (artifactId: number) => {
    setDownloading(artifactId);
    const params = new URLSearchParams({
      owner: settings.repoConfig.owner,
      repo: settings.repoConfig.repo,
      artifactId: String(artifactId),
    });

    const res = await fetch(`/api/github/artifacts?${params}`);
    if (res.ok) {
      const data = await res.json();
      window.open(data.downloadUrl, "_blank");
    }
    setDownloading(null);
  };

  // Clean up detection polling on unmount
  useEffect(() => {
    return () => {
      if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
    };
  }, []);

  const stopDetecting = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
  };

  const waitForDevice = (onDetected: () => void) => {
    stopDetecting();
    detectIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/firmware/detect");
        const data = await res.json();
        if (data.detected) {
          stopDetecting();
          onDetected();
        }
      } catch {
        // ignore detection errors, keep polling
      }
    }, 1500);
  };

  const flashFirmware = async (filename: string): Promise<boolean> => {
    const res = await fetch("/api/firmware/flash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firmwareDir: install.firmwareDir, filename }),
    });
    return res.ok;
  };

  const handleInstall = async (artifactId: number) => {
    setInstall({ step: "preparing", firmwareDir: null, leftFile: null, rightFile: null, error: null });

    try {
      const res = await fetch("/api/firmware/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: settings.repoConfig.owner,
          repo: settings.repoConfig.repo,
          artifactId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setInstall((s) => ({ ...s, step: "error", error: data.error || "Failed to prepare firmware" }));
        return;
      }

      const { leftFile, rightFile, firmwareDir } = await res.json();
      setInstall({ step: "waiting-left", firmwareDir, leftFile, rightFile, error: null });

      // Start polling for left device
      waitForDevice(() => {
        setInstall((s) => ({ ...s, step: "flashing-left" }));
      });
    } catch (err) {
      setInstall((s) => ({ ...s, step: "error", error: err instanceof Error ? err.message : "Unknown error" }));
    }
  };

  // Handle flashing steps via effects
  useEffect(() => {
    if (install.step === "flashing-left" && install.leftFile && install.firmwareDir) {
      (async () => {
        const ok = await flashFirmware(install.leftFile!);
        if (ok) {
          // Wait a moment for the device to disconnect, then wait for right
          setTimeout(() => {
            setInstall((s) => ({ ...s, step: "waiting-right" }));
            waitForDevice(() => {
              setInstall((s) => ({ ...s, step: "flashing-right" }));
            });
          }, 3000);
        } else {
          setInstall((s) => ({ ...s, step: "error", error: "Failed to flash left firmware" }));
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [install.step]);

  useEffect(() => {
    if (install.step === "flashing-right" && install.rightFile && install.firmwareDir) {
      (async () => {
        const ok = await flashFirmware(install.rightFile!);
        if (ok) {
          setInstall((s) => ({ ...s, step: "complete" }));
        } else {
          setInstall((s) => ({ ...s, step: "error", error: "Failed to flash right firmware" }));
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [install.step]);

  const cancelInstall = () => {
    stopDetecting();
    setInstall({ step: "idle", firmwareDir: null, leftFile: null, rightFile: null, error: null });
  };

  const statusIcon = (status: string, conclusion: string | null) => {
    if (status === "completed" && conclusion === "success") {
      return (
        <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
      );
    }
    if (status === "completed" && conclusion === "failure") {
      return (
        <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
      );
    }
    if (status === "in_progress" || status === "queued") {
      return (
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
      );
    }
    return (
      <span className="w-2.5 h-2.5 rounded-full bg-key-subtext inline-block" />
    );
  };

  if (!settings.repoConfig.owner) {
    return (
      <div className="p-4 text-sm text-key-subtext">
        Configure repo settings to monitor builds.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-surface-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-key-text">Builds</h3>
          {polling && (
            <p className="text-xs text-yellow-400 mt-0.5">Monitoring...</p>
          )}
        </div>
        <button
          onClick={fetchRuns}
          className="p-1.5 hover:bg-surface-3 rounded-md transition-colors text-key-subtext hover:text-key-text"
          title="Refresh"
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
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 && (
          <div className="p-4 text-sm text-key-subtext text-center">
            No recent builds
          </div>
        )}
        {runs.map((run) => (
          <div
            key={run.id}
            className="px-4 py-3 border-b border-surface-3/50"
          >
            <div className="flex items-center gap-2">
              {statusIcon(run.status, run.conclusion)}
              <span className="text-sm text-key-text flex-1">
                {run.status === "completed"
                  ? run.conclusion === "success"
                    ? "Build succeeded"
                    : "Build failed"
                  : run.status === "in_progress"
                    ? "Building..."
                    : "Queued"}
              </span>
              <a
                href={run.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:text-accent-hover"
              >
                View
              </a>
            </div>

            <p className="text-xs text-key-subtext mt-1">
              {new Date(run.createdAt).toLocaleString()} &middot;{" "}
              {run.headSha.slice(0, 7)}
            </p>

            {run.artifacts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {run.artifacts.map((artifact) => (
                  <div key={artifact.id} className="flex gap-1">
                    <button
                      onClick={() => handleDownload(artifact.id)}
                      disabled={downloading === artifact.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent text-xs rounded-md transition-colors disabled:opacity-50"
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
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      Download
                    </button>
                    <button
                      onClick={() => handleInstall(artifact.id)}
                      disabled={install.step !== "idle"}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs rounded-md transition-colors disabled:opacity-50"
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
                          d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      Install
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Install progress overlay */}
      {install.step !== "idle" && (
        <div className="border-t border-surface-3 bg-surface-1">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-key-text">Firmware Install</h4>
              {install.step !== "complete" && (
                <button
                  onClick={cancelInstall}
                  className="text-xs text-key-subtext hover:text-red-400 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            <div className="space-y-2">
              {/* Step 1: Preparing */}
              <InstallStepRow
                label="Downloading & extracting firmware"
                state={
                  install.step === "preparing"
                    ? "active"
                    : install.step === "error" && !install.firmwareDir
                      ? "error"
                      : install.firmwareDir
                        ? "done"
                        : "pending"
                }
              />

              {/* Step 2: Left side */}
              <InstallStepRow
                label={
                  install.step === "waiting-left"
                    ? "Plug in LEFT half (bootloader mode)"
                    : install.step === "flashing-left"
                      ? `Flashing ${install.leftFile}...`
                      : `Flash left half${install.leftFile ? ` (${install.leftFile})` : ""}`
                }
                state={
                  install.step === "waiting-left"
                    ? "waiting"
                    : install.step === "flashing-left"
                      ? "active"
                      : ["waiting-right", "flashing-right", "complete"].includes(install.step)
                        ? "done"
                        : install.step === "error" && install.firmwareDir && !["waiting-right", "flashing-right", "complete"].includes(install.step)
                          ? "error"
                          : "pending"
                }
              />

              {/* Step 3: Right side */}
              <InstallStepRow
                label={
                  install.step === "waiting-right"
                    ? "Plug in RIGHT half (bootloader mode)"
                    : install.step === "flashing-right"
                      ? `Flashing ${install.rightFile}...`
                      : `Flash right half${install.rightFile ? ` (${install.rightFile})` : ""}`
                }
                state={
                  install.step === "waiting-right"
                    ? "waiting"
                    : install.step === "flashing-right"
                      ? "active"
                      : install.step === "complete"
                        ? "done"
                        : install.step === "error" && ["flashing-right"].includes(install.step)
                          ? "error"
                          : "pending"
                }
              />
            </div>

            {install.step === "complete" && (
              <div className="mt-3 p-2 bg-green-500/10 rounded-lg">
                <p className="text-xs text-green-400 text-center font-medium">
                  Firmware installed successfully!
                </p>
                <button
                  onClick={cancelInstall}
                  className="mt-2 w-full px-3 py-1.5 text-xs bg-surface-3 hover:bg-surface-3/80 text-key-text rounded-md transition-colors"
                >
                  Done
                </button>
              </div>
            )}

            {install.step === "error" && install.error && (
              <div className="mt-3 p-2 bg-red-500/10 rounded-lg">
                <p className="text-xs text-red-400">{install.error}</p>
                <button
                  onClick={cancelInstall}
                  className="mt-2 w-full px-3 py-1.5 text-xs bg-surface-3 hover:bg-surface-3/80 text-key-text rounded-md transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InstallStepRow({ label, state }: { label: string; state: "pending" | "active" | "waiting" | "done" | "error" }) {
  return (
    <div className="flex items-center gap-2.5">
      {state === "done" && (
        <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      {state === "active" && (
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
        </div>
      )}
      {state === "waiting" && (
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
        </div>
      )}
      {state === "pending" && (
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          <div className="w-2 h-2 rounded-full bg-surface-3" />
        </div>
      )}
      {state === "error" && (
        <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span
        className={`text-xs ${
          state === "done"
            ? "text-green-400"
            : state === "active" || state === "waiting"
              ? "text-key-text"
              : state === "error"
                ? "text-red-400"
                : "text-key-subtext"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
