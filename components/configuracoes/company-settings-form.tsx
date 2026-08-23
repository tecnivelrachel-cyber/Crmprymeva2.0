"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { companySettingsSchema, type CompanySettingsInput } from "@/lib/validation/schemas";
import { updateCompanySettingsAction, uploadCompanyLogoAction } from "@/app/(crm)/configuracoes/empresa/actions";
import type { CompanySettings } from "@/types/database";

interface CompanySettingsFormProps {
  settings: CompanySettings;
}

export function CompanySettingsForm({ settings }: CompanySettingsFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState(settings.logo_url);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanySettingsInput>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: {
      razao_social: settings.razao_social ?? "",
      nome_fantasia: settings.nome_fantasia ?? "",
      cnpj: settings.cnpj ?? "",
      inscricao_estadual: settings.inscricao_estadual ?? "",
      telefone: settings.telefone ?? "",
      whatsapp: settings.whatsapp ?? "",
      email: settings.email ?? "",
      site: settings.site ?? "",
      endereco: settings.endereco ?? "",
      numero: settings.numero ?? "",
      complemento: settings.complemento ?? "",
      bairro: settings.bairro ?? "",
      cidade: settings.cidade ?? "",
      estado: settings.estado ?? "",
      cep: settings.cep ?? "",
      accent_color: settings.accent_color ?? "",
      observacoes: settings.observacoes ?? "",
    },
  });

  async function onSubmit(values: CompanySettingsInput) {
    setServerError(null);
    const result = await updateCompanySettingsAction(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.refresh();
  }

  async function onLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setServerError(null);
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadCompanyLogoAction(formData);
      if (result.error) {
        setServerError(result.error);
        return;
      }
      if (result.logoUrl) setLogoUrl(result.logoUrl);
      router.refresh();
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink-900">Logomarca</h2>
        <p className="mt-1 text-xs text-ink-500">
          Aparece no menu lateral e nos orçamentos gerados. PNG, JPG, WEBP ou SVG — até 2MB.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-surface-border bg-surface">
            {logoUrl ? (
              <Image src={logoUrl} alt="Logomarca da empresa" width={64} height={64} className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] text-ink-400">Sem logo</span>
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={onLogoChange}
            />
            <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploadingLogo ? "Enviando..." : "Enviar logomarca"}
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">Identificação</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="razao_social">Razão social</Label>
              <Input id="razao_social" {...register("razao_social")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nome_fantasia">Nome fantasia</Label>
              <Input id="nome_fantasia" {...register("nome_fantasia")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" placeholder="00.000.000/0000-00" {...register("cnpj")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inscricao_estadual">Inscrição estadual</Label>
              <Input id="inscricao_estadual" {...register("inscricao_estadual")} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">Contato</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input id="telefone" {...register("telefone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp comercial</Label>
              <Input id="whatsapp" {...register("whatsapp")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="site">Site</Label>
              <Input id="site" {...register("site")} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">Endereço</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" {...register("endereco")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="numero">Número</Label>
              <Input id="numero" {...register("numero")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="complemento">Complemento</Label>
              <Input id="complemento" {...register("complemento")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" {...register("bairro")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" {...register("cep")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" {...register("cidade")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado (UF)</Label>
              <Input id="estado" maxLength={2} {...register("estado")} />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">Personalização</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="accent_color">Cor de destaque (opcional)</Label>
              <Input id="accent_color" placeholder="#6225D5" {...register("accent_color")} />
              {errors.accent_color && <p className="text-xs text-danger">{errors.accent_color.message}</p>}
              <p className="text-xs text-ink-500">Deixe em branco para usar a paleta padrão do Prymeva CRM.</p>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="observacoes">Observações comerciais</Label>
            <Textarea id="observacoes" rows={3} {...register("observacoes")} />
            <p className="text-xs text-ink-500">Usado como condições/observações padrão em propostas.</p>
          </div>
        </div>

        {serverError && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {serverError}
          </div>
        )}

        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          Salvar dados da empresa
        </Button>
      </form>
    </div>
  );
}
