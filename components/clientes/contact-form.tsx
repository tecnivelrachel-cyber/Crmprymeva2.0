"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { contactSchema, type ContactInput } from "@/lib/validation/schemas";
import { createContactAction, updateContactAction } from "@/app/(crm)/clientes/actions";
import type { Profile, Contact, ContactSegment } from "@/types/database";

const SEGMENTS: ContactSegment[] = [
  "Posto",
  "TRR",
  "Distribuidora",
  "Aviação",
  "Indústria",
  "Agrícola",
  "Cooperativa",
  "Balsa flutuante",
  "Outros",
];

interface ContactFormProps {
  mode: "create" | "edit";
  contact?: Contact;
  users: Pick<Profile, "id" | "full_name">[];
}

export function ContactForm({ mode, contact, users }: ContactFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = mode === "edit";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: isEdit
      ? {
          full_name: contact!.full_name,
          company_name: contact!.company_name ?? "",
          phone: contact!.phone ?? "",
          email: contact!.email ?? "",
          cnpj: contact!.cnpj ?? "",
          city: contact!.city ?? "",
          state: contact!.state ?? "",
          segment: contact!.segment ?? "",
          source: contact!.source ?? "",
          notes: contact!.notes ?? "",
          tags: contact!.tags ?? [],
          assigned_user_id: contact!.assigned_user_id,
        }
      : { tags: [] },
  });

  async function onSubmit(values: ContactInput) {
    setServerError(null);
    const result = isEdit ? await updateContactAction(contact!.id, values) : await createContactAction(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    const targetId = isEdit ? contact!.id : result.id;
    router.push(`/clientes/${targetId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="full_name">Nome completo</Label>
          <Input id="full_name" {...register("full_name")} />
          {errors.full_name && <p className="text-xs text-danger">{errors.full_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company_name">Empresa</Label>
          <Input id="company_name" {...register("company_name")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone / WhatsApp</Label>
          <Input id="phone" placeholder="(00) 00000-0000" {...register("phone")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...register("email")} />
          {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cnpj">CNPJ</Label>
          <Input id="cnpj" {...register("cnpj")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">Cidade</Label>
          <Input id="city" {...register("city")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">UF</Label>
          <Input id="state" maxLength={2} className="uppercase" {...register("state")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="segment">Segmento</Label>
          <Select id="segment" {...register("segment")}>
            <option value="">Selecione</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="source">Origem</Label>
          <Input id="source" placeholder="Indicação, site, Kommo..." {...register("source")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assigned_user_id">Responsável</Label>
          <Select id="assigned_user_id" {...register("assigned_user_id")}>
            <option value="">Sem responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" rows={4} {...register("notes")} />
        </div>
      </div>

      {serverError && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {serverError}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={16} className="animate-spin" />}
          {isEdit ? "Salvar alterações" : "Criar cliente"}
        </Button>
      </div>
    </form>
  );
}
