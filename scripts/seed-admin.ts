/**
 * Cria o administrador inicial do TecNivel CRM de forma idempotente.
 * Uso: npm run seed:admin
 *
 * Lê as credenciais de variáveis de ambiente — nunca hardcode a senha.
 * Requer: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fullPermissionsMap } from "../lib/permissions";

// tsx não carrega .env.local automaticamente (só o `next dev`/`next build` fazem isso) —
// carregamos aqui para que `npm run seed:admin` funcione isoladamente.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.INITIAL_ADMIN_EMAIL ?? "comercialtecnivel@gmail.com";
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!url || !serviceRoleKey) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar o seed.");
    process.exit(1);
  }
  if (!password) {
    console.error("Defina INITIAL_ADMIN_PASSWORD antes de rodar o seed (não é gerada automaticamente).");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Verifica se o administrador já existe (por e-mail, paginando os usuários).
  let existingUserId: string | null = null;
  let page = 1;
  while (!existingUserId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) existingUserId = found.id;
    if (data.users.length < 200) break;
    page += 1;
  }

  let userId = existingUserId;

  if (!userId) {
    // 2. Cria o usuário no Auth, já com e-mail confirmado.
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`Usuário criado no Auth (${email}).`);
  } else {
    // 2b. Usuário já existe — garante e-mail confirmado e sincroniza a senha
    // com a variável de ambiente atual (idempotente, sem imprimir a senha).
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;
    console.log(`Usuário já existia no Auth (${email}) — senha e confirmação de e-mail sincronizadas.`);
  }

  // 3. Cria/atualiza o perfil com is_admin = true e todas as permissões ativas.
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: "Administrador TecNível",
      email,
      job_title: "Administrador",
      is_admin: true,
      is_active: true,
      permissions: fullPermissionsMap(),
    },
    { onConflict: "id" }
  );

  if (profileError) throw profileError;

  console.log("Perfil de administrador criado/atualizado com sucesso.");
  console.log(`E-mail: ${email}`);
  console.log("Senha: (definida pela variável de ambiente — não exibida por segurança)");
}

main().catch((err) => {
  console.error("Falha ao criar o administrador inicial:", err.message ?? err);
  process.exit(1);
});
