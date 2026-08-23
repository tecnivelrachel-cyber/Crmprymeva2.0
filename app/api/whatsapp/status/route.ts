import { NextRequest, NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getBridgeStatus, isValidPurpose, managePermissionFor, resolveBridgeConfigByPurpose } from "@/lib/whatsapp/bridge";
import { isWhatsappMockMode } from "@/lib/whatsapp/client";

export async function GET(request: NextRequest) {
  const profile = await requireProfile();
  const purpose = request.nextUrl.searchParams.get("purpose");
  if (!isValidPurpose(purpose)) {
    return NextResponse.json({ error: "purpose inválido (use 'commercial' ou 'post_sale')" }, { status: 400 });
  }
  if (!hasPermission(profile, managePermissionFor(purpose))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const mockMode = isWhatsappMockMode();
  const config = await resolveBridgeConfigByPurpose(purpose);

  if (mockMode || !config) {
    return NextResponse.json({
      status: "disconnected",
      connectedNumber: null,
      deviceName: null,
      connectedAt: null,
      lastMessageAt: null,
      lastError: null,
      configured: !!config,
      mockMode,
    });
  }

  try {
    const status = await getBridgeStatus(config);
    return NextResponse.json({ ...status, configured: true, mockMode: false });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
