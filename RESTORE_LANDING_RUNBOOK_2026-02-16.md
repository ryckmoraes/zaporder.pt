# RUNBOOK - Zaporder Landing Recovery and Restore (2026-02-16)

## 1) Scope and objective
This document records:
- incidents observed in production
- fixes applied
- server paths and active architecture
- exact backup inventory
- full step-by-step restore to the current known-good state
- validation checklist

Date reference: 2026-02-16 (UTC).

## 2) Current production architecture (landing)
- Host root: `/var/www/zaporder`
- Main entry page: `/var/www/zaporder/index.html`
- Main landing bundle: `/var/www/zaporder/assets/index-5911a1c4.js`
- Current bundle reference in `index.html`: `assets/index-5911a1c4.js?v=1771283685`
- CSS reference: `assets/index-c071df06.css?v=14`
- Runtime patching is done inside `index.html` in `updateSite()`:
  - WhatsApp number normalization `351966745647 -> 351925054899`
  - Hero CTA "Começar Agora" override to `https://onboarding.zaporder.pt/`
  - Top-header only "Painel" injection next to "Falar Agora" (`data-zaporder-top-panel="1"`)
  - Removal of old injected panel (`data-zaporder-panel="1"`)
  - Post-it promo banner creation with close behavior (session storage)

## 3) Incident history and fixes applied
### 3.1 Broken characters (mojibake)
Symptoms:
- `Ã`, `â€¢`, `ðŸ`, `��` in legal and landing pages.
Cause:
- mixed/incorrectly rewritten content and fragile byte-level edits in published files.
Fixes:
- direct HTML cleanup on server for public pages
- restored clean bundle backups where needed
- final scan reported `REMAINING_BAD 0` for server-side `*.html`

### 3.2 Landing vanished (only static sponsor/banner visible)
Symptoms:
- React app not mounting; only static part of `index.html` visible.
Cause:
- syntax error introduced in `/assets/index-5911a1c4.js` during selector patching.
Fix:
- restored stable asset backup
- moved fragile logic to `index.html` runtime patcher

### 3.3 Panel button visibility/injection conflicts
Symptoms:
- Panel appears in wrong places or appears invisible/missing.
Causes:
- broad selector and runtime number rewrite mismatch.
Fixes:
- removed old generic injected panel
- added specific top-header panel injection only
- marker for top-only panel: `data-zaporder-top-panel="1"`

### 3.4 Promo post-it removed, restored, and text corrected
Actions:
- post-it reintroduced in `updateSite()` with guard `if (!postit-banner)`
- text finalized as:
  - `Teste GRÁTIS por até`
  - `*45 dias`
  - `Sem compromisso • Cancele quando quiser`
  - `*Termos e condições se aplicam` (inside post-it, not footer)

## 4) Important paths
- Production root: `/var/www/zaporder`
- Active files:
  - `/var/www/zaporder/index.html`
  - `/var/www/zaporder/assets/index-5911a1c4.js`
- Local operational script (workspace): `deploy_safe.ps1`

## 5) Backup inventory (created during this session)
### 5.1 `index.html` backups
- `/var/www/zaporder/index.html.bak_restore_top_panel_20260216T233118Z`
- `/var/www/zaporder/index.html.bak_move_terms_to_postit_20260216T232940Z`
- `/var/www/zaporder/index.html.bak_text_terms_20260216T232722Z`
- `/var/www/zaporder/index.html.bak_restore_postit_20260216T232353Z`
- `/var/www/zaporder/index.html.bak_onboarding_fix_20260216T232208Z`
- `/var/www/zaporder/index.html.bak_remove_panel_20260216T232114Z`
- `/var/www/zaporder/index.html.bak_cta_20260216T231928Z`
- `/var/www/zaporder/index.html.bak_user_safe_20260216T231820Z`

### 5.2 asset backups
- `/var/www/zaporder/assets/index-5911a1c4.js.bak_deploysafe_20260216T225920Z` (stable baseline used)
- `/var/www/zaporder/assets/index-5911a1c4.js.bak_hotfix_20260216T230254Z`
- `/var/www/zaporder/assets/index-5911a1c4.js.bak_hotfix_panel_20260216T231027Z`
- `/var/www/zaporder/assets/index-5911a1c4.js.bak_restore_20260216T231445Z`

## 6) Exact restore to current state (recommended)
Use this when you need to reconstruct the exact current known-good landing.

### Step 1 - Pre-check and backup current live files
```bash
sudo cp /var/www/zaporder/index.html /var/www/zaporder/index.html.pre_restore_$(date +%Y%m%dT%H%M%SZ)
sudo cp /var/www/zaporder/assets/index-5911a1c4.js /var/www/zaporder/assets/index-5911a1c4.js.pre_restore_$(date +%Y%m%dT%H%M%SZ)
```

### Step 2 - Restore stable bundle
```bash
sudo cp /var/www/zaporder/assets/index-5911a1c4.js.bak_deploysafe_20260216T225920Z /var/www/zaporder/assets/index-5911a1c4.js
```

### Step 3 - Restore final `index.html` (latest known-good)
Use the latest backup from this sequence:
```bash
sudo cp /var/www/zaporder/index.html.bak_restore_top_panel_20260216T233118Z /var/www/zaporder/index.html
```
Then reapply final text updates if needed (post-it terms placement):
```bash
# If your restored file does not yet include final post-it text placement,
# use the latest backup instead:
# /var/www/zaporder/index.html.bak_move_terms_to_postit_20260216T232940Z
```
Operationally, prefer whichever backup contains all final user-approved outcomes.

### Step 4 - Ensure target strings are correct in `index.html`
Check these exact lines:
- hero CTA target:
  - `link.href = 'https://onboarding.zaporder.pt/';`
- top panel logic exists:
  - `data-zaporder-top-panel="1"`
- old panel cleanup exists:
  - `a[data-zaporder-panel="1"][href="https://clientes.zaporder.pt"]`
- post-it texts:
  - `Teste <b>GRÁTIS</b> por até`
  - `*45 dias`
  - `Sem compromisso • Cancele quando quiser`
  - `*Termos e condições se aplicam`

### Step 5 - Validation (mandatory)
```bash
# Syntax sanity (if node is available)
node --check /var/www/zaporder/assets/index-5911a1c4.js

# No mojibake in primary page
grep -nE '�|Ã|â€¢|ðŸ' /var/www/zaporder/index.html || true

# Confirm active asset ref in index
grep -n 'index-5911a1c4.js?v=' /var/www/zaporder/index.html
```

### Step 6 - Browser validation checklist
- Open `https://www.zaporder.pt/?v=<timestamp>`
- Verify:
  - landing renders (not only static sponsor area)
  - top header has `Falar Agora` + `Painel`
  - hero `Começar Agora` goes to `https://onboarding.zaporder.pt/`
  - post-it appears with exact approved text
  - no mojibake characters visible

## 7) Full rollback procedure
If any step breaks rendering:
```bash
# rollback index
sudo cp /var/www/zaporder/index.html.bak_restore_top_panel_20260216T233118Z /var/www/zaporder/index.html
# rollback asset
sudo cp /var/www/zaporder/assets/index-5911a1c4.js.bak_deploysafe_20260216T225920Z /var/www/zaporder/assets/index-5911a1c4.js
```
Revalidate with Step 5 + Step 6.

## 8) Deployment notes
- Deploy method used in this workspace is operational/script-based (`deploy_safe.ps1` + SSH/SCP), not CI GitOps.
- Always run encoding validation before upload:
```powershell
node .\validate_encoding.js .\dist_clean\assets .\assets
```

## 9) Git commit/deploy status
Current workspace (`c:\Users\Maria\Documents\zaporder.pt`) is **not** a Git repository:
- `.git` missing in current, parent and grandparent directories.
- `git rev-parse --is-inside-work-tree` fails.

Therefore a direct `git commit`/`git push` cannot be executed from this path until the correct repo root is provided or cloned.

## 10) Operator recommendation
- Keep this runbook with the backup list.
- For future changes, avoid direct minified asset editing unless absolutely necessary.
- Prefer source-level change + build + scripted deploy with pre/post checks.
