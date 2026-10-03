import { NextResponse } from "next/server";

// Hardcoded admin credentials for local dev
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      return NextResponse.json({
        success: true,
        token: "local_admin_token_astra_2026",
        user: { username: "admin", role: "PLATFORM_SUPER_ADMIN" },
      });
    }

    return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 400 });
  }
}
