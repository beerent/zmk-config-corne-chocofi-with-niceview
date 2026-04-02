import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "octokit";
import { getAuthenticatedOctokit } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const result = getAuthenticatedOctokit(req);
  if (result instanceof NextResponse) return result;
  const octokit: Octokit = result;

  const params = req.nextUrl.searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const artifactId = params.get("artifactId");

  if (!owner || !repo || !artifactId) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  const { url } = await octokit.rest.actions.downloadArtifact({
    owner,
    repo,
    artifact_id: parseInt(artifactId, 10),
    archive_format: "zip",
  });

  return NextResponse.json({ downloadUrl: url });
}
