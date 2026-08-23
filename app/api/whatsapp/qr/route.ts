import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getBridgeQr, isValidPurpose, managePermissionFor, resolveBridgeConfigByPurpose } from "@/lib/whatsapp/bridge";

export async function GET(request: NextRequest) {
  const profile = await requireProfile();
  const purpose = request.nextUrl.searchParams.get("purpose");
  if (!isValidPurpose(purpose)) {
    return NextResponse.json({ error: "purpose inválido (use 'commercial' ou 'post_sale')" }, { status: 400 });
  }
  if (!hasPermission(profile, managePermissionFor(purpose))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const config = await resolveBridgeConfigByPurpose(purpose);
  if (!config) {
    return NextResponse.json({ error: "bridge_not_configured" }, { status: 503 });
  }

  try {
    const result = await getBridgeQr(config);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
