import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { bridgeDisconnect, isValidPurpose, managePermissionFor, resolveBridgeConfigByPurpose } from "@/lib/whatsapp/bridge";
import { logAudit } from "@/lib/audit/log";

export async function POST(request: NextRequest) {
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
    await bridgeDisconnect(config);
    await logAudit({ actorUserId: profile.id, action: "whatsapp.disconnect", entityType: "whatsapp_bridge" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
