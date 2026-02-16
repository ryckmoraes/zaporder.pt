# Deploy seguro (anti-corrupt UTF-8)

## 1) Nao usar scripts destrutivos
Os scripts abaixo foram bloqueados de proposito:
- `fix_encoding.js`
- `fix_all_encoding.js`
- `fix_all_encoding_v2.js`
- `fix_html_encoding.js`

Eles alteravam bytes brutos e podiam corromper texto/emoji.

## 2) Validar antes de enviar
```bash
node validate_encoding.js
```

Se houver qualquer `[bad]`, o deploy deve parar.

## 3) Predeploy completo com manifesto
```bash
node predeploy_safe.js
```

Esse comando:
- executa `validate_encoding.js`
- bloqueia deploy se encontrar corrupcao
- gera `deploy-manifest-<timestamp>.txt` com SHA-256 dos arquivos

## 4) Deploy unico (local -> VM) com backup automatico
No PowerShell, execute:

```powershell
.\deploy_safe.ps1
```

Esse comando:
- valida encoding (`validate_encoding.js`)
- gera manifesto (`predeploy_safe.js`)
- envia `dist_clean/assets/index-5911a1c4.js` para a VM
- cria backup do asset atual e do `index.html` remoto
- atualiza `?v=` no `index.html` para cache-bust
- valida por bytes no servidor e aborta se achar mojibake

### Opcoes uteis
Somente validar localmente:

```powershell
.\deploy_safe.ps1 -SkipUpload
```

Forcar uma versao de cache especifica:

```powershell
.\deploy_safe.ps1 -Version 22
```

Customizar host/chave/caminho remoto:

```powershell
.\deploy_safe.ps1 -VmHost "ubuntu@SEU-HOST" -SshKey "C:\caminho\chave.key" -RemoteRoot "/var/www/zaporder"
```
