import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("github_oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      new URL("/?error=oauth_failed", req.nextUrl.origin)
    );
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/?error=server_config", req.nextUrl.origin)
    );
  }

  // Exchange code for access token
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(
      new URL("/?error=token_exchange", req.nextUrl.origin)
    );
  }

  // Fetch user info for display
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userData = await userRes.json();

  const response = NextResponse.redirect(new URL("/", req.nextUrl.origin));

  // Store token in httpOnly cookie
  response.cookies.set("github_token", tokenData.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  // Store username in a readable cookie for the UI
  response.cookies.set("github_user", userData.login || "", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  // Clear the state cookie
  response.cookies.delete("github_oauth_state");

  return response;
}
