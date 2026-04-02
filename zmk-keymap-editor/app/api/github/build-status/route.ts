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

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  const { data: runs } = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    branch,
    per_page: 5,
  });

  const results = await Promise.all(
    runs.workflow_runs.map(async (run) => {
      let artifacts: { id: number; name: string; size_in_bytes: number }[] = [];

      if (run.status === "completed" && run.conclusion === "success") {
        const { data: artifactData } =
          await octokit.rest.actions.listWorkflowRunArtifacts({
            owner,
            repo,
            run_id: run.id,
          });
        artifacts = artifactData.artifacts.map((a) => ({
          id: a.id,
          name: a.name,
          size_in_bytes: a.size_in_bytes,
        }));
      }

      return {
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        htmlUrl: run.html_url,
        createdAt: run.created_at,
        headSha: run.head_sha,
        artifacts,
      };
    })
  );

  return NextResponse.json({ runs: results });
}
