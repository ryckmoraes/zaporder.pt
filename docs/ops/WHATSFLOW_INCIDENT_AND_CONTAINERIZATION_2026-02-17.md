# WhatsFlow Incident + Containerization Runbook

Date: 2026-02-17
Environment: staging (whatsflow.zaporder.pt)

## 1) Incident summary

Symptoms reported by user:
- whatsflow.zaporder.pt returning 500/502
- login appeared successful but dashboard did not open
- no cards shown in WhatsFlow dashboard

Observed behavior:
- /api/admin/whatsflow-auth login returned success
- middleware redirected /whatsflow/dashboard back to login due to user_auth cookie check
- WhatsFlow auth flow uses sessionToken in localStorage (not user_auth cookie)

## 2) Root causes found

1. Runtime instability in app process (hot/cached state and previous corrupted source state in staging tree).
2. Middleware logic for hostOnly === 'whatsflow.zaporder.pt' incorrectly gated dashboard access by user_auth cookie.

## 3) Corrective actions applied

### 3.1 Middleware fix (staging runtime)

Adjusted whatsflow.zaporder.pt block to:
- keep root/login aliases redirecting to /whatsflow/login
- normalize /pt/... dashboard/login aliases
- **remove cookie-based guard** that blocked /whatsflow/dashboard when user_auth was absent

Result:
- login and dashboard routing stopped looping

### 3.2 Containerization implemented (staging)

Created and applied container deployment for app + worker:
- deployment/Dockerfile.whatsflow
- deployment/docker-compose.whatsflow.yml
- scripts/container/deploy-whatsflow.sh
- scripts/container/rollback-whatsflow.sh

Deployed image tag in staging:
- zaporderx:20260217T143515Z

Current staging container state:
- zaporderx-staging-app-1 up
- zaporderx-staging-worker-1 up
- PM2 zaporderx and zaporderx-worker stopped (cutover to containers)

## 4) Validation after fix

Public checks (2026-02-17):
- https://whatsflow.zaporder.pt/whatsflow/login => 200
- https://whatsflow.zaporder.pt/whatsflow/dashboard => 200
- https://whatsflow.zaporder.pt/api/health => 200

Internal host checks:
- http://127.0.0.1:3000/api/health => 200

## 5) Deploy and rollback commands

From app root on VM:

### Deploy staging
`ash
./scripts/container/deploy-whatsflow.sh staging
`

### Deploy production
`ash
./scripts/container/deploy-whatsflow.sh production
`

### Rollback staging
`ash
./scripts/container/rollback-whatsflow.sh staging
`

### Rollback production
`ash
./scripts/container/rollback-whatsflow.sh production
`

Notes:
- scripts track tags in .deploy/<env>.current and .deploy/<env>.previous
- default docker command uses sudo -E docker
- compose up uses local built image (--pull never)

## 6) Production rollout checklist

1. Copy same files to production VM app root.
2. Ensure .env.production is present and valid.
3. Run production deploy script.
4. Validate:
   - /whatsflow/login
   - /whatsflow/dashboard
   - /api/health
5. Keep rollback command ready.

## 7) Important operational note

The previous dashboard block was caused by middleware-cookie coupling. Any future auth changes in WhatsFlow must keep middleware routing independent from user_auth cookie, unless WhatsFlow flow is migrated to cookie auth intentionally.
