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
  const branch = params.get("branch") || "main";
  const path = params.get("path") || "config/corne.keymap";

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  const { data: commits } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    sha: branch,
    path,
    per_page: 20,
  });

  return NextResponse.json({
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      date: c.commit.author?.date,
      author: c.commit.author?.name,
    })),
  });
}
