'use client'

import { Field, Input } from '@/components/ui/field'
import type { QuoteDraft } from '@/lib/actions'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
  'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

export function StepClient({
  draft,
  set,
}: {
  draft: QuoteDraft
  set: (patch: Partial<QuoteDraft>) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        Preencha só o que tiver em mãos — nenhum campo é obrigatório para salvar.
      </p>

      <Field label="Razão social">
        <Input
          value={draft.razao_social ?? ''}
          onChange={(event) => set({ razao_social: event.target.value })}
          placeholder="Empresa LTDA"
          autoCapitalize="words"
        />
      </Field>

      <Field label="Nome fantasia">
        <Input
          value={draft.nome_fantasia ?? ''}
          onChange={(event) => set({ nome_fantasia: event.target.value })}
          placeholder="Como o cliente é conhecido"
          autoCapitalize="words"
        />
      </Field>

      <Field label="Responsável">
        <Input
          value={draft.responsavel ?? ''}
          onChange={(event) => set({ responsavel: event.target.value })}
          placeholder="Quem está negociando"
          autoCapitalize="words"
        />
      </Field>

      <Field label="CNPJ ou CPF">
        <Input
          inputMode="numeric"
          value={draft.document ?? ''}
          onChange={(event) => set({ document: event.target.value })}
          placeholder="Somente números"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefone">
          <Input
            type="tel"
            inputMode="tel"
            value={draft.phone ?? ''}
            onChange={(event) => set({ phone: event.target.value })}
            placeholder="(00) 0000-0000"
          />
        </Field>

        <Field label="WhatsApp">
          <Input
            type="tel"
            inputMode="tel"
            value={draft.whatsapp ?? ''}
            onChange={(event) => set({ whatsapp: event.target.value })}
            placeholder="(00) 00000-0000"
          />
        </Field>
      </div>

      <Field label="E-mail">
        <Input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={draft.email ?? ''}
          onChange={(event) => set({ email: event.target.value })}
          placeholder="contato@empresa.com.br"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field label="Cidade">
          <Input
            value={draft.city ?? ''}
            onChange={(event) => set({ city: event.target.value })}
            autoCapitalize="words"
          />
        </Field>

        <Field label="Estado">
          <select
            value={draft.state ?? ''}
            onChange={(event) => set({ state: event.target.value })}
            className="h-[3.25rem] w-full rounded-xl border border-slate-200 bg-white px-4 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          >
            <option value="">UF</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Endereço">
        <Input
          value={draft.address ?? ''}
          onChange={(event) => set({ address: event.target.value })}
          placeholder="Rua, número, bairro"
        />
      </Field>

      <Field label="CEP">
        <Input
          inputMode="numeric"
          value={draft.cep ?? ''}
          onChange={(event) => set({ cep: event.target.value })}
          placeholder="00000-000"
        />
      </Field>
    </div>
  )
}
