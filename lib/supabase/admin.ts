import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo com a service role key.
 * NUNCA importar este arquivo em Client Components — o pacote "server-only"
 * garante que o build falha caso isso aconteça por engano.
 * Uso: criação/edição/exclusão de usuários via supabase.auth.admin.*,
 * processamento de webhook do WhatsApp e ações administrativas do servidor.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
