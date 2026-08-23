import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProfile } from "@/lib/auth/session";
import { hasAnyPermission } from "@/lib/permissions";
import { sendWhatsappMessage } from "@/lib/whatsapp/send";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(["text", "image", "document", "audio", "video"]).default("text"),
  text: z.string().max(4096).optional(),
  caption: z.string().max(4096).optional(),
  mediaUrl: z.string().url().optional(),
  mediaPath: z.string().max(500).optional(),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(255).optional(),
  fileSize: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  const profile = await requireProfile();
  if (!hasAnyPermission(profile, ["send_messages", "send_post_sale_messages"])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await sendWhatsappMessage({ ...parsed.data, senderUserId: profile.id });
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId, mocked: result.mocked });
}
