import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "octokit";
import { getAuthenticatedOctokit } from "@/lib/auth";

// GET: Fetch keymap file from repo
export async function GET(req: NextRequest) {
  const result = getAuthenticatedOctokit(req);
  if (result instanceof NextResponse) return result;
  const octokit: Octokit = result;

  const params = req.nextUrl.searchParams;
  const owner = params.get("owner");
  const repo = params.get("repo");
  const path = params.get("path") || "config/corne.keymap";
  const branch = params.get("branch") || "main";

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  // Fetch keymap file
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  });

  if (!("content" in data)) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  const sha = data.sha;

  // Fetch changelog file (may not exist yet)
  let changelog: unknown[] = [];
  try {
    const { data: clData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".zmk-editor/changelog.json",
      ref: branch,
    });
    if ("content" in clData) {
      changelog = JSON.parse(
        Buffer.from(clData.content, "base64").toString("utf-8")
      );
    }
  } catch {
    // File doesn't exist yet — that's fine
  }

  return NextResponse.json({ content, sha, path: data.path, changelog });
}

// POST: Commit updated keymap + changelog to repo (multi-file via Git Trees API)
export async function POST(req: NextRequest) {
  const result = getAuthenticatedOctokit(req);
  if (result instanceof NextResponse) return result;
  const octokit: Octokit = result;

  const { owner, repo, branch, content, message, changelog, keymapPath } =
    await req.json();

  if (!owner || !repo || !content) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  const branchName = branch || "main";
  const path = keymapPath || "config/corne.keymap";

  // Get the latest commit SHA on the branch
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
  });
  const latestCommitSha = refData.object.sha;

  // Get the tree SHA of the latest commit
  const { data: commitData } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: latestCommitSha,
  });
  const baseTreeSha = commitData.tree.sha;

  // Create blobs for both files
  const [keymapBlob, changelogBlob] = await Promise.all([
    octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(content).toString("base64"),
      encoding: "base64",
    }),
    octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(JSON.stringify(changelog || [], null, 2)).toString(
        "base64"
      ),
      encoding: "base64",
    }),
  ]);

  // Create a new tree with both files
  const { data: treeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: [
      {
        path,
        mode: "100644",
        type: "blob",
        sha: keymapBlob.data.sha,
      },
      {
        path: ".zmk-editor/changelog.json",
        mode: "100644",
        type: "blob",
        sha: changelogBlob.data.sha,
      },
    ],
  });

  // Create a new commit
  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: message || "Update keymap via ZMK Keymap Editor",
    tree: treeData.sha,
    parents: [latestCommitSha],
  });

  // Update the branch reference
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
    sha: newCommit.sha,
  });

  // Get the new keymap file SHA for future commits
  const { data: newFileData } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref: newCommit.sha,
  });

  return NextResponse.json({
    sha: "content" in newFileData ? newFileData.sha : null,
    commitSha: newCommit.sha,
    commitUrl: newCommit.html_url,
  });
}
