import { NextResponse } from "next/server";
import { existsSync, readdirSync } from "fs";

// nice!nano appears as USB mass storage at /Volumes/NICENANO when in bootloader mode
const NICENANO_VOLUME = "/Volumes/NICENANO";

export async function GET() {
  try {
    const detected = existsSync(NICENANO_VOLUME);

    // Double-check it looks like a valid UF2 bootloader drive
    let isValid = false;
    if (detected) {
      try {
        const files = readdirSync(NICENANO_VOLUME);
        // UF2 bootloader drives typically have INFO_UF2.TXT or CURRENT.UF2
        isValid = files.some(
          (f) => f === "INFO_UF2.TXT" || f === "CURRENT.UF2" || f.endsWith(".uf2")
        );
        if (!isValid) {
          // Even without those files, if the volume name matches, trust it
          isValid = true;
        }
      } catch {
        isValid = false;
      }
    }

    return NextResponse.json({ detected: detected && isValid, volumePath: NICENANO_VOLUME });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
