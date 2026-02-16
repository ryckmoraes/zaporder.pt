# WhatsFlow Restore Runbook - 2026-02-16

## Objetivo
Restaurar e manter `https://whatsflow.zaporder.pt` apontando para o dashboard real de pedidos WhatsFlow (sem mock), com:
- autenticação de sessão funcional
- atualização automática de pedidos
- mudança de status com notificação automática
- histórico de concluídos visível no rodapé

## Ambiente e serviços
- VM: Oracle Ubuntu (acesso via Tailscale SSH)
- App path em produção: `/home/ubuntu/zaporderx-vnic-staging`
- Processo Node: PM2
  - `zaporderx` (web)
  - `zaporderx-worker` (jobs/worker)
- Build: Next.js 16 (Turbopack)

## Acesso e deploy
### SSH
```bash
ssh -i C:\Users\Maria\Downloads\ssh-key-2026-02-16.key ubuntu@zaporder-vnic.tail04f1e2.ts.net
```

### Deploy de arquivos do Windows para VM
```bash
scp -i C:\Users\Maria\Downloads\ssh-key-2026-02-16.key <arquivo-local> ubuntu@zaporder-vnic.tail04f1e2.ts.net:<destino-na-vm>
```

### Build e restart
```bash
ssh -i C:\Users\Maria\Downloads\ssh-key-2026-02-16.key ubuntu@zaporder-vnic.tail04f1e2.ts.net "cd /home/ubuntu/zaporderx-vnic-staging && npx next build && pm2 restart zaporderx zaporderx-worker"
```

## Arquitetura funcional atual do WhatsFlow
### Frontend
- Página de entrada: `/whatsflow` redireciona para `/whatsflow/dashboard`
- Login: `/whatsflow/login`
- Dashboard: `/whatsflow/dashboard`
  - Grid com cards de pedidos
  - Modal com itens e ações de status
  - Polling automático (5s)
  - Refresh ao foco/aba visível
  - Som de novo pedido (toggle persistido em localStorage)
  - Rodapé com histórico de pedidos concluídos + identificação de cliente/usuário

### APIs usadas pelo dashboard
- `GET /api/admin/whatsflow-auth?sessionToken=...`
  - valida sessão, usuário e acesso WhatsFlow
- `GET /api/whatsflow/orders`
  - retorna pedidos do cliente autenticado
- `POST /api/whatsflow/orders/status`
  - atualiza status e dispara notificação automática de mudança

### Dados e sessão
- Sessão no browser: `localStorage` chave `whatsflow_session`
- Toggle de som: `localStorage` chave `whatsflowmenu-sound-enabled`
- Resolução de sessão backend:
  1. tabela `whatsflow_sessions` por `session_token`
  2. fallback `users.whatsflow_session_token`

## Erros encontrados e correções aplicadas
### 1) `supabaseKey is required`
Sintoma:
- Erro JS no frontend ao abrir WhatsFlow.
Causa:
- Config/env do Supabase indisponível para rota/página usada naquele estado.
Correção:
- Reorganização de fluxo para usar páginas/APIs já conectadas ao app principal e validação de sessão antes de carregar dados.

### 2) Redirecionamento para dashboard errado / página mock
Sintoma:
- `whatsflow.zaporder.pt` caindo em dashboard de usuário comum ou UI mockada.
Causa:
- Página raiz de WhatsFlow não estava forçando destino correto.
Correção:
- `app/whatsflow/page.tsx` ajustado para redirecionar ao dashboard real (`/whatsflow/dashboard`).

### 3) Loop de login com 401
Sintoma:
- Login 200 seguido de `checkAuth`/sessão com 401 em fluxo subsequente.
Causa:
- Inconsistência entre token salvo, validação de sessão e endpoints esperados.
Correção:
- Dashboard passou a validar sessão em `/api/admin/whatsflow-auth` e só carregar pedidos com token válido.

### 4) `POST /api/admin/whatsflow-auth 404`
Sintoma:
- Chamada para endpoint inexistente no método/rota usada.
Correção:
- Fluxo alinhado para endpoint disponível e contrato correto de autenticação.

### 5) `GET /api/admin/whatsflow-auth?... 401`
Sintoma:
- Sessão inválida durante bootstrap.
Causa:
- Token não resolvido na origem esperada.
Correção:
- Implementado fallback de resolução por `users.whatsflow_session_token`.

### 6) Erro de schema em pedidos (`order_no` inexistente)
Sintoma:
- API de pedidos falhando com 500/502.
Causa:
- Código dependia de coluna não existente na tabela real.
Correção:
- API ajustada para colunas reais (`order_number`, `order_data`, etc.) e para lookup correto por cliente.

### 7) Mudança de status sem automação completa de notificação
Sintoma:
- Necessidade de garantir envio automático após alterar status.
Correção:
- Endpoint `POST /api/whatsflow/orders/status` unificado para usar `updateOrderStatus(..., { notify: true })`.

## Arquivos-chave alterados no estado atual
- `/home/ubuntu/zaporderx-vnic-staging/app/whatsflow/page.tsx`
- `/home/ubuntu/zaporderx-vnic-staging/app/whatsflow/dashboard/page.tsx`
- `/home/ubuntu/zaporderx-vnic-staging/src/lib/sound.ts`
- `/home/ubuntu/zaporderx-vnic-staging/app/api/whatsflow/orders/route.ts`
- `/home/ubuntu/zaporderx-vnic-staging/app/api/whatsflow/orders/status/route.ts`
- `/home/ubuntu/zaporderx-vnic-staging/WHATSFLOW_RESTORE_RUNBOOK_2026-02-16.md`

## Passo a passo para restaurar WhatsFlow do zero para o estado atual
1. Conectar na VM via Tailscale SSH.
2. Confirmar diretório do app:
```bash
cd /home/ubuntu/zaporderx-vnic-staging
```
3. Confirmar processos PM2:
```bash
pm2 list
```
4. Aplicar arquivos corretos de WhatsFlow (dashboard + APIs) via `scp`.
5. Build de produção:
```bash
npx next build
```
6. Reiniciar serviços:
```bash
pm2 restart zaporderx zaporderx-worker
```
7. Validar endpoints:
```bash
curl -I https://whatsflow.zaporder.pt/whatsflow/dashboard
curl -X POST https://whatsflow.zaporder.pt/api/whatsflow/orders/status -H "Content-Type: application/json" -d "{}" -i
```
Esperado:
- dashboard `200`
- status sem sessão `401`

8. Validar funcionalidade no browser:
- login WhatsFlow concluído sem loop
- pedidos entram automaticamente (polling 5s)
- ao mudar status para "Em preparação" / "Concluir", atualização persiste
- histórico de concluídos aparece no rodapé
- som funciona quando habilitado

## Checklist de troubleshooting rápido
- Se rota der 404:
  - conferir se arquivo existe no caminho `app/api/.../route.ts`
  - rebuild + restart PM2
- Se der 401 em loop:
  - validar token salvo no `localStorage` (`whatsflow_session`)
  - validar resolução do token em `whatsflow_sessions` e fallback em `users`
- Se UI antiga aparecer:
  - hard refresh (`Ctrl+F5`)
  - limpar cache do browser
- Se build falhar:
  - conferir imports e nomes de colunas em Supabase
  - corrigir e rebuild

## Estado final confirmado (2026-02-16)
- Dashboard real WhatsFlow ativo
- Sem página mock no fluxo principal
- Polling automático 5s ativo
- Notificação automática de mudança de status ativa no backend
- Histórico de pedidos concluídos visível no rodapé
- `Cliente | Usuário` exibido centralizado no rodapé
