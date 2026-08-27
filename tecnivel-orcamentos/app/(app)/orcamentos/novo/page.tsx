import { createQuote } from '@/lib/actions'

/**
 * "Novo orçamento" da barra inferior: cria o rascunho e redireciona.
 * Não existe formulário aqui — o vendedor já cai direto na etapa 1.
 */
export default async function NewQuotePage() {
  await createQuote()
  return null
}
