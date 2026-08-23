/**
 * Cria o SUPER_ADMIN inicial do Prymeva CRM de forma idempotente.
 * Uso: npm run seed:admin
 *
 * Lê as credenciais de variáveis de ambiente — nunca hardcode a senha em
 * código versionado. Os defaults abaixo (rachel@crm.com / rachel123) são
 * SÓ o acesso administrativo de desenvolvimento/bootstrap desta instalação
 * (ver CLAUDE.md, seção "ACESSO INICIAL DO DESENVOLVEDOR") — troque-os via
 * INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD antes de entregar a instalação
 * a um cliente comprador.
 * Requer: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Opcionais:
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
  const email = process.env.INITIAL_ADMIN_EMAIL ?? "rachel@crm.com";
  // explicitPassword só existe quando a variável foi definida de propósito —
  // usada para trocar a senha de um usuário já existente. Sem ela, um
  // usuário existente NUNCA tem a senha tocada (evita restaurar "rachel123"
  // por cima de uma senha que o SUPER_ADMIN já trocou pela própria conta).
  const explicitPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const password = explicitPassword ?? "rachel123"; // só usada ao CRIAR o usuário pela 1ª vez

  if (!url || !serviceRoleKey) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar o seed.");
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
  const isNewUser = !userId;

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
  } else if (explicitPassword) {
    // 2b. Usuário já existe e uma senha foi passada explicitamente — troca
    // a senha de propósito (nunca acontece sozinho, só quando alguém define
    // INITIAL_ADMIN_PASSWORD na hora de rodar o seed).
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: explicitPassword,
      email_confirm: true,
    });
    if (updateError) throw updateError;
    console.log(`Usuário já existia no Auth (${email}) — senha atualizada conforme INITIAL_ADMIN_PASSWORD.`);
  } else {
    console.log(`Usuário já existia no Auth (${email}) — senha preservada (defina INITIAL_ADMIN_PASSWORD para trocá-la).`);
  }

  // 3. Cria/atualiza o perfil. Em usuário NOVO, define role='super_admin'
  // (ver 028_company_settings_and_super_admin.sql) — em usuário existente,
  // nunca sobrescreve role: pode ter sido rebaixado de propósito durante uma
  // venda/transferência controlada da instalação (ver CLAUDE.md).
  const profileUpsert: Record<string, unknown> = {
    id: userId,
    email,
    is_admin: true,
    is_active: true,
    permissions: fullPermissionsMap(),
  };
  if (isNewUser) {
    profileUpsert.full_name = "Administrador Prymeva";
    profileUpsert.job_title = "Administrador";
    profileUpsert.role = "super_admin";
  }

  const { error: profileError } = await supabase.from("profiles").upsert(profileUpsert, { onConflict: "id" });

  if (profileError) throw profileError;

  console.log("Perfil de administrador criado/atualizado com sucesso.");
  console.log(`E-mail: ${email}`);
  console.log("Senha: (definida pela variável de ambiente ou pelo default de desenvolvimento — não exibida por segurança)");
}

main().catch((err) => {
  console.error("Falha ao criar o administrador inicial:", err.message ?? err);
  process.exit(1);
});
