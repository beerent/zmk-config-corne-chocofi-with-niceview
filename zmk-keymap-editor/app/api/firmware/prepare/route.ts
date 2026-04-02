import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedOctokit } from "@/lib/auth";
import { Octokit } from "octokit";
import { writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const FIRMWARE_DIR = "/tmp/zmk-firmware";

export async function POST(req: NextRequest) {
  const result = getAuthenticatedOctokit(req);
  if (result instanceof NextResponse) return result;
  const octokit: Octokit = result;

  const { owner, repo, artifactId } = await req.json();
  if (!owner || !repo || !artifactId) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    // Download the artifact ZIP
    const { url } = await octokit.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: artifactId,
      archive_format: "zip",
    });

    // Fetch the ZIP data
    const zipRes = await fetch(url);
    if (!zipRes.ok) {
      return NextResponse.json({ error: "Failed to download artifact" }, { status: 500 });
    }
    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());

    // Clean and create firmware directory
    execSync(`rm -rf ${FIRMWARE_DIR}`);
    mkdirSync(FIRMWARE_DIR, { recursive: true });

    // Write ZIP and extract
    const zipPath = join(FIRMWARE_DIR, "firmware.zip");
    writeFileSync(zipPath, zipBuffer);
    execSync(`unzip -o "${zipPath}" -d "${FIRMWARE_DIR}"`);

    // Find .uf2 files
    const files = readdirSync(FIRMWARE_DIR).filter((f) => f.endsWith(".uf2"));

    // Identify left and right firmware
    const leftFile = files.find((f) => f.toLowerCase().includes("left"));
    const rightFile = files.find((f) => f.toLowerCase().includes("right"));

    if (!leftFile || !rightFile) {
      return NextResponse.json(
        { error: `Could not identify left/right firmware. Found: ${files.join(", ")}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      leftFile,
      rightFile,
      firmwareDir: FIRMWARE_DIR,
      files,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[firmware/prepare] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
