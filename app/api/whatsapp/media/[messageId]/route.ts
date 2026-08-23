import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createMediaSignedUrl } from "@/lib/whatsapp/media-storage";
import { decideMediaAccess } from "@/lib/whatsapp/media-access";

const paramsSchema = z.object({ messageId: z.string().uuid() });

/**
 * Único caminho de leitura de mídia pelo navegador. O caminho do objeto vem
 * SEMPRE do banco (coluna media_url), nunca da query string; o acesso à
 * conversa é decidido pela RLS (a consulta roda com o token do usuário, não
 * com a service role); e a URL assinada gerada dura poucos minutos.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const profile = await getCurrentProfile();
  const parsed = paramsSchema.safeParse(await params);

  // RLS de messages segue a visibilidade da conversa — mensagem de conversa
  // que este usuário não pode ver simplesmente não retorna.
  let message: { media_url: string | null } | null = null;
  let queryFailed = false;

  if (profile && parsed.success) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("media_url")
      .eq("id", parsed.data.messageId)
      .maybeSingle();
    message = data;
    queryFailed = !!error;
  }

  const decision = decideMediaAccess({
    authenticated: !!profile,
    validMessageId: parsed.success,
    queryFailed,
    message,
  });

  if (decision.status !== 200) {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }

  try {
    const signedUrl = await createMediaSignedUrl(decision.mediaPath);
    return NextResponse.redirect(signedUrl, { status: 307 });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
