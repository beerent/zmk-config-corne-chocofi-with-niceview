import { NextRequest, NextResponse } from "next/server";
import { copyFileSync, existsSync } from "fs";
import { join } from "path";

const NICENANO_VOLUME = "/Volumes/NICENANO";

export async function POST(req: NextRequest) {
  const { firmwareDir, filename } = await req.json();

  if (!firmwareDir || !filename) {
    return NextResponse.json({ error: "Missing firmwareDir or filename" }, { status: 400 });
  }

  const sourcePath = join(firmwareDir, filename);
  if (!existsSync(sourcePath)) {
    return NextResponse.json({ error: `Firmware file not found: ${filename}` }, { status: 404 });
  }

  if (!existsSync(NICENANO_VOLUME)) {
    return NextResponse.json({ error: "nice!nano not detected" }, { status: 400 });
  }

  try {
    const destPath = join(NICENANO_VOLUME, filename);
    copyFileSync(sourcePath, destPath);

    return NextResponse.json({ success: true, copied: filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[firmware/flash] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
