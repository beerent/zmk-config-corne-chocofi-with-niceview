import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const githubToken = req.cookies.get("github_token")?.value;
  const githubUser = req.cookies.get("github_user")?.value;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    github: {
      authenticated: !!githubToken,
      username: githubUser || null,
    },
    claude: {
      configured: hasAnthropicKey,
    },
  });
}
