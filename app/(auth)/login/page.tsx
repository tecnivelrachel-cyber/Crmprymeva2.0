"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginInput } from "@/lib/validation/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });

    if (error) {
      setServerError(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar. Tente novamente."
      );
      return;
    }

    const redirect = searchParams.get("redirect") ?? "/dashboard";
    router.push(redirect);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <Image
            src="/brand/logo-tecnivel-symbol.png"
            alt="TecNível"
            width={80}
            height={95}
            priority
            className="mx-auto mb-4 h-20 w-auto"
          />
          <Image
            src="/brand/logo-tecnivel-wordmark.png"
            alt="TecNível"
            width={220}
            height={38}
            priority
            className="mx-auto h-8 w-auto"
          />
          <p className="mt-2 text-sm text-ink-500">
            Gestão comercial, atendimento e relacionamento em um só lugar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="voce@tecnivel.com.br"
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pr-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-300 hover:text-ink-500"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
            </div>

            {serverError && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
                {serverError}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              Entrar
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
