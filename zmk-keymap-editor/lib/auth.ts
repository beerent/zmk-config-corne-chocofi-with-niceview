import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "octokit";

export function getGitHubToken(req: NextRequest): string | null {
  return req.cookies.get("github_token")?.value || null;
}

export function getAuthenticatedOctokit(req: NextRequest): Octokit | NextResponse {
  const token = getGitHubToken(req);
  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated with GitHub. Please sign in." },
      { status: 401 }
    );
  }
  return new Octokit({ auth: token });
}
