"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ui/toast";

/**
 * Mostra o toast de exclusão quando a página chega com ?deleted=1 (posto lá
 * pelo redirect do ConversationWorkspace após excluir). Fica FORA da área
 * que troca entre lista/conversa selecionada, então sobrevive à navegação
 * que a própria exclusão dispara.
 */
export function DeletedToastHost({ show: initialShow }: { show: boolean }) {
  const router = useRouter();
  const [show, setShow] = useState(initialShow);

  useEffect(() => {
    if (!initialShow) return;
    // Remove ?deleted=1 da URL (sem nova entrada no histórico) para não
    // reexibir o toast num refresh ou num "voltar" do navegador.
    router.replace("/conversas", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, []);

  if (!show) return null;
  return <Toast message="Conversa excluída somente do CRM." onDismiss={() => setShow(false)} />;
}
