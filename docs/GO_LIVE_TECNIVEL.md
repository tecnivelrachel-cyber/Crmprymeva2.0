# TecNivel CRM — Guia de início de uso

**URL de acesso:** https://tecnivel-crm.vercel.app

## Perfis e responsabilidades

- **Administrador**: acesso integral — Comercial, Pós-venda, Usuários, Configurações, exclusões permanentes.
- **Comercial**: Conversas Comerciais, Clientes, Funil, Orçamentos, Tarefas, Follow-ups. Sem acesso ao WhatsApp Pós-venda nem às rotas administrativas.
- **Pós-venda** (`access_scope = post_sale_only`): só o módulo de Pós-venda (`/pos-venda`, `/pos-venda/whatsapp`) — processos atribuídos, checklist, equipamentos, arquivos, comentários, tarefas do processo. Sem acesso a rotas Comerciais, mesmo digitando a URL direto.

## Fluxo Comercial diário

1. Abrir **Conversas** — atender quem está aguardando resposta.
2. **Qualificar** o cliente pela própria conversa (seletor de etapa no topo) — isso já move o card no Funil sozinho, sem precisar abrir o Funil.
3. Criar um **orçamento** direto na conversa (painel comercial → Orçamentos).
4. Aprovar e depois **converter em venda** quando o cliente confirmar — isso já move o negócio para "Fechado" e cria o processo de Pós-venda automaticamente.
5. Criar **tarefas** de acompanhamento quando necessário.

## Fluxo de Pós-venda diário

1. Abrir **Pós-venda** (Kanban) — ver os processos por etapa.
2. Abrir um processo para ver Visão geral, Checklist, Equipamentos, Arquivos, Comentários, Tarefas e Histórico.
3. Usar **WhatsApp Pós-venda** para atender o cliente pelo número de Pós-venda — nunca pelo Comercial.
4. Marcar itens do checklist, anexar fotos/documentos, registrar equipamentos instalados.
5. Mover a etapa até "Instalação concluída".

## Como o Pós-venda é criado

Automático: quando um negócio é marcado como **Fechado/Ganho** (pela conversa, pelo Funil, ou ao converter um orçamento em venda), o sistema cria o processo de Pós-venda sozinho — nunca duplica, mesmo se a ação for repetida. A conversa Comercial nunca é alterada; uma conversa separada de Pós-venda é aberta/reaproveitada automaticamente.

## Ocultar vs. excluir permanentemente

- **Ocultar do CRM** (ícone de lixeira normal): some da lista, mas nada é apagado. Uma mensagem nova do cliente traz a conversa de volta sozinha.
- **Excluir permanentemente** (opção separada, com aviso vermelho, exige digitar "EXCLUIR"): apaga mensagens, mídias, orçamentos e processos de Pós-venda vinculados de vez. **Não tem volta.** Só quem tem a permissão dedicada de exclusão permanente vê essa opção.

## Cuidado com os dois números internos

O número Comercial e o número de Pós-venda são contas de WhatsApp diferentes. Se um dos dois números mandar mensagem para o outro (teste interno), o CRM mostra um aviso "Número interno TecNivel" — isso é normal, não é vazamento de dado entre as contas.

## Se o WhatsApp estiver desconectado

Ir em **Configurações → WhatsApp**, no bloco da conta afetada (Comercial ou Pós-venda), e gerar um novo QR Code. Se aparecer "Bridge indisponível ou demorou para responder", aguardar alguns segundos e tentar de novo — o serviço pode estar reiniciando.

## Só o Administrador pode

- Criar/editar/desativar usuários e permissões.
- Excluir registros permanentemente.
- Alterar configurações de WhatsApp e do sistema.

## Checklist do início do expediente

1. Entrar no CRM.
2. Conferir o Dashboard — prioridades do dia.
3. Abrir Conversas — ver quem está aguardando resposta.
4. Conferir tarefas do dia.

## Checklist do final do expediente

1. Confirmar que conversas urgentes foram respondidas.
2. Atualizar etapas do Funil que mudaram durante o dia.
3. Marcar tarefas concluídas.
4. Registrar pendências do Pós-venda no checklist do processo.

## Canal para reportar problemas

Reportar diretamente para quem está conduzindo a implantação do CRM (esta mesma pessoa/canal usado durante os testes).
