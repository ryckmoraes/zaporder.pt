# Operacao de Correcao e Deploy Seguro (2026-02-16)

## Objetivo
- Remover apenas o logo do rodape (`<img ... class="h-8 w-auto">`) sem alterar o restante da landing.
- Manter correcoes de UTF-8.
- Publicar com validacao anti-mojibake e backup remoto.
- Limpar arquivos temporarios locais e remotos sem apagar backups de seguranca.

## Arquitetura Atual (resumo)
- Publicacao baseada em bundle estatico JavaScript.
- Bundle principal local: `dist_clean/assets/index-5911a1c4.js`.
- Bundles espelho locais:
  - `dist_clean/assets/index-5911a1c4-v4.js`
  - `assets/index-CeEbyQDl-v2.js`
  - `assets/index-fc45cc1d-v2.js`
- Servidor remoto:
  - Root: `/var/www/zaporder`
  - Asset servido: `/var/www/zaporder/assets/index-5911a1c4.js`
  - Entrada HTML: `/var/www/zaporder/index.html`

## Arquivos Alterados
- `dist_clean/assets/index-5911a1c4.js`
- `dist_clean/assets/index-5911a1c4-v4.js`
- `assets/index-CeEbyQDl-v2.js`
- `assets/index-fc45cc1d-v2.js`
- `deploy_safe.ps1`
- `DEPLOY_SAFE.md`

## Correcao Funcional Aplicada
- Removido apenas o elemento de imagem do rodape nos bundles:
  - trecho removido: `f.jsx("img",{src:"/assets/zaporder-logo.png",alt:"ZapOrder Logo",className:"h-8 w-auto"}),`
- Resultado esperado no rodape:
  - mantido: texto/brand (`ZapOrder`) e restante do footer
  - removido: imagem pequena do logo

## Erros Encontrados e Correcao
- Erro: `Remote install/verification failed` sem detalhe.
  - Causa: captura silenciosa de saida remota.
  - Correcao: execucao remota com log em tempo real e `bash -se`.

- Erro: `sudo test -f ''`.
  - Causa: expansao indevida de variaveis bash pelo PowerShell.
  - Correcao: placeholders (`__...__`) e substituicao explicita antes do envio.

- Erro: `NameError: name 'PY' is not defined`.
  - Causa: fragilidade de heredoc Python no pipeline PowerShell -> SSH -> bash.
  - Correcao: substituido por `python3 -c` com variaveis de ambiente.

## Deploy Executado
- Comando: `.\deploy_safe.ps1`
- Resultado: sucesso
- Versao publicada no HTML: `index-5911a1c4.js?v=1771279115`
- Backups remotos criados:
  - `/var/www/zaporder/assets/index-5911a1c4.js.bak_deploysafe_20260216T215836Z`
  - `/var/www/zaporder/index.html.bak_deploysafe_20260216T215836Z`

## Validacoes Pos-Deploy
- URL principal aponta para:
  - `assets/index-5911a1c4.js?v=1771279115`
- No asset publicado:
  - `className:"h-8 w-auto"` = `0` (rodape removido)
  - `className:"h-10 w-auto"` = `1` (logo do header mantido)

## Limpeza de Lixo (segura)
- Local:
  - removidos manifestos antigos `deploy-manifest-*.txt`
  - mantido apenas: `deploy-manifest-2026-02-16T21-58-36.110Z.txt`
- Remoto (`/tmp`):
  - removidos scripts temporarios de correcao:
    - `fix_bytes.py`
    - `fix_js_cp1252.py`
    - `fix_js_literals.py`
    - `fix_targeted.py`
    - `fix_zaporder_encoding.py`
  - removido arquivo temporario de upload:
    - `/tmp/index-5911a1c4.js`
- Nao removidos:
  - backups remotos (`.bak_*`) para rollback seguro

## Rollback (se necessario)
- Restaurar asset:
  - `sudo cp /var/www/zaporder/assets/index-5911a1c4.js.bak_deploysafe_20260216T215836Z /var/www/zaporder/assets/index-5911a1c4.js`
- Restaurar index:
  - `sudo cp /var/www/zaporder/index.html.bak_deploysafe_20260216T215836Z /var/www/zaporder/index.html`

## Git / Commit / Push
- Estado encontrado: sem repositorio Git neste caminho.
- Verificacao:
  - `git rev-parse --is-inside-work-tree` -> erro `not a git repository`
- Portanto, commit e push nao puderam ser executados neste diretorio.
