import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import { buildSystemPrompt } from "@/lib/system-prompt";

const CLAUDE_CLI = "/Users/thedevdad/.claude/local/claude";
const KEYMAP_WORK_FILE = "/tmp/zmk-editor-keymap.keymap";

// Track the active Claude process so it can be killed on cancel
let activeProc: ReturnType<typeof spawn> | null = null;

// Track the session ID for conversation continuity
let sessionId: string | null = null;

export async function DELETE() {
  if (activeProc) {
    console.log("[chat] Cancelling active Claude process, pid:", activeProc.pid);
    activeProc.kill("SIGTERM");
    activeProc = null;
    return NextResponse.json({ cancelled: true });
  }
  return NextResponse.json({ cancelled: false });
}

// PATCH: Reset the session (e.g., when user clears chat)
export async function PATCH() {
  console.log("[chat] Resetting session, old sessionId:", sessionId);
  sessionId = null;
  return NextResponse.json({ reset: true });
}

export async function POST(req: NextRequest) {
  console.log("[chat] POST request received");
  const { messages, currentKeymap } = await req.json();
  console.log("[chat] Parsed body, messages:", messages.length, "keymap length:", currentKeymap?.length);

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }

  const lastUserMsg = messages
    .filter((m: { role: string }) => m.role === "user")
    .pop();
  if (!lastUserMsg) {
    return NextResponse.json({ error: "No user message" }, { status: 400 });
  }
  console.log("[chat] User message:", lastUserMsg.content.slice(0, 100));

  // Write current keymap to a working file so Claude can edit it directly
  writeFileSync(KEYMAP_WORK_FILE, currentKeymap, "utf-8");

  const systemPrompt = buildSystemPrompt(currentKeymap);
  const prompt = `${lastUserMsg.content}\n\nThe keymap file is at: ${KEYMAP_WORK_FILE}\nIf you need to make changes, edit that file directly using your Edit tool. Then explain what you changed.`;

  const args: string[] = [
    "-p", prompt,
    "--output-format", "json",
    "--system-prompt", systemPrompt,
    "--allowedTools", "Read,Edit,Write",
    "--model", "claude-opus-4-6",
  ];

  // Resume existing session if we have one
  if (sessionId) {
    args.push("--resume", sessionId);
    console.log("[chat] Resuming session:", sessionId);
  } else {
    console.log("[chat] Starting new session");
  }

  console.log("[chat] Spawning Claude CLI with tools enabled");

  try {
    const rawOutput = await new Promise<string>((resolve, reject) => {
      const proc = spawn(CLAUDE_CLI, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, HOME: "/Users/thedevdad", CLAUDECODE: "" },
      });
      activeProc = proc;
      console.log("[chat] Process spawned, pid:", proc.pid);

      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error("Claude CLI timed out after 180s"));
      }, 180000);

      proc.on("close", (code) => {
        clearTimeout(timer);
        activeProc = null;
        if (code !== 0) {
          console.error("[chat] Claude CLI error (exit code", code, "):", stderr);
          // If resume failed, clear session and let next request start fresh
          if (sessionId) {
            console.log("[chat] Clearing stale session, will start fresh next time");
            sessionId = null;
          }
          reject(new Error(stderr || `Process exited with code ${code}`));
          return;
        }
        console.log("[chat] Claude CLI returned, stdout length:", stdout.length);
        resolve(stdout.trim());
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        console.error("[chat] Claude CLI spawn error:", err.message);
        reject(err);
      });
    });

    let textContent: string;
    try {
      const parsed = JSON.parse(rawOutput);
      // Capture session ID for future requests
      if (parsed.session_id) {
        sessionId = parsed.session_id;
        console.log("[chat] Session ID captured:", sessionId);
      }
      textContent = parsed.result || parsed.text || rawOutput;
    } catch {
      textContent = rawOutput;
    }

    // Read the file back — if Claude edited it, it'll differ from currentKeymap
    let newKeymap: string | null = null;
    try {
      const editedKeymap = readFileSync(KEYMAP_WORK_FILE, "utf-8");
      if (editedKeymap !== currentKeymap) {
        newKeymap = editedKeymap;
        console.log("[chat] Keymap was modified by Claude, new length:", editedKeymap.length);
      } else {
        console.log("[chat] Keymap unchanged");
      }
    } catch (e) {
      console.error("[chat] Failed to read back keymap file:", e);
    }

    // Strip any keymap code blocks from the display text (the file edit IS the change)
    const cleanedText = textContent.replace(/```keymap\n[\s\S]*?```/g, "").trim();

    console.log("[chat] Responding with content length:", cleanedText.length, "newKeymap:", !!newKeymap);
    return NextResponse.json({ content: cleanedText, newKeymap });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat] Error caught:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
