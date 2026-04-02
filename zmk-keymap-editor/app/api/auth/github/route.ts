import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/github/callback`;
  const scope = "repo";

  // Generate a random state param to prevent CSRF
  const state = crypto.randomUUID();

  const response = NextResponse.redirect(
    `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`
  );

  // Store state in cookie for verification
  response.cookies.set("github_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
