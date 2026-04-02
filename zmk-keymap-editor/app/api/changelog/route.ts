import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";

// Local changelog file — source of truth for all changes (committed + uncommitted)
const REPO_ROOT = join(process.cwd(), "..");
const CHANGELOG_PATH = join(REPO_ROOT, ".zmk-editor", "changelog.json");

// GET: Read changelog from local file
export async function GET() {
  try {
    if (!existsSync(CHANGELOG_PATH)) {
      return NextResponse.json({ entries: [] });
    }
    const raw = readFileSync(CHANGELOG_PATH, "utf-8");
    const entries = JSON.parse(raw);
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}

// POST: Write changelog to local file
export async function POST(req: NextRequest) {
  try {
    const { entries } = await req.json();
    const dir = dirname(CHANGELOG_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(CHANGELOG_PATH, JSON.stringify(entries, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
