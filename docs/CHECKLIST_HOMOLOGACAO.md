# Checklist de homologação — TecNivel CRM

Sem conhecimento técnico necessário. Faça na ordem.

1. Entrar como administrador em https://tecnivel-crm.vercel.app
2. Abrir o **Dashboard** — confirmar que os números aparecem sem erro.
3. Abrir uma **conversa Comercial** de teste.
4. Alterar a etapa dessa conversa para uma etapa de teste (ex.: "Negociação").
5. Abrir o **Funil comercial** e confirmar que o card aparece na mesma etapa, sem precisar recarregar a página.
6. Criar (ou abrir) um **orçamento de teste** vinculado a essa conversa.
7. Confirmar o valor do orçamento.
8. Marcar o negócio como **Fechado/Ganho** (pela conversa, pelo Funil, ou convertendo o orçamento).
9. Abrir **Pós-venda** e confirmar que um processo novo apareceu — só um, mesmo repetindo a ação de novo.
10. Abrir **WhatsApp Pós-venda** e confirmar que é uma conta separada do WhatsApp Comercial.
11. Confirmar que a conversa Comercial de teste continua exatamente como estava (não foi alterada).
12. Excluir o registro de teste criado (usar "Excluir permanentemente" na conversa, se aplicável).
13. Confirmar que o valor some do Dashboard e o card some do Funil/Pós-venda depois da exclusão.
14. Sair e entrar como um usuário **Comercial** — confirmar que não aparece WhatsApp Pós-venda no menu, e que digitar a URL `/pos-venda` direto não abre.
15. Sair e entrar como um usuário **Pós-venda** — confirmar que só aparece o módulo de Pós-venda, e que digitar `/funil` ou `/conversas` direto não abre.
16. Confirmar que nenhuma mensagem real de WhatsApp foi enviada durante os testes acima.

Se todos os passos acima funcionarem como descrito, o CRM está pronto para uso diário da equipe.
