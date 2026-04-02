import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

export async function GET() {
  try {
    // The app lives inside the zmk-config repo, so go up one level
    const repoRoot = path.resolve(process.cwd(), "..");

    // Verify it's a git repo
    if (!existsSync(path.join(repoRoot, ".git"))) {
      return NextResponse.json({ error: "Not a git repo" }, { status: 404 });
    }

    const remoteUrl = execSync("git remote get-url origin", {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();

    // Parse owner/repo from SSH or HTTPS URL
    const match = remoteUrl.match(
      /(?:github\.com[:/])([^/]+)\/([^/.]+?)(?:\.git)?$/
    );
    if (!match) {
      return NextResponse.json(
        { error: "Could not parse remote URL" },
        { status: 400 }
      );
    }

    const owner = match[1];
    const repo = match[2];

    // Detect branch
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: repoRoot,
      encoding: "utf-8",
    }).trim();

    // Find keymap file
    const keymapCandidates = [
      "config/corne.keymap",
      "config/splitkb_aurora_corne.keymap",
    ];
    let keymapPath = "config/corne.keymap";
    for (const candidate of keymapCandidates) {
      if (existsSync(path.join(repoRoot, candidate))) {
        keymapPath = candidate;
        break;
      }
    }

    return NextResponse.json({ owner, repo, branch, keymapPath });
  } catch {
    return NextResponse.json(
      { error: "Failed to detect repo" },
      { status: 500 }
    );
  }
}
