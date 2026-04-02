export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  keymapSnapshot?: string; // keymap state after this message
}

export interface ChangeLogEntry {
  id: string;
  timestamp: number;
  description: string;
  keymapBefore: string;
  keymapAfter: string;
  messageId?: string;
  committed?: boolean;
  commitName?: string;
  reverted?: boolean;
}

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  keymapPath: string;
}

export interface AppSettings {
  repoConfig: RepoConfig;
}

export interface BuildRun {
  id: number;
  status: "queued" | "in_progress" | "completed" | "failure";
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
  artifacts: BuildArtifact[];
}

export interface BuildArtifact {
  id: number;
  name: string;
  sizeInBytes: number;
  downloadUrl: string;
}
