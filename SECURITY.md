# Security

Earth Engine authentication belongs on the backend or the developer's machine.
GitHub Pages serves a public static build. It never needs Earth Engine credentials.

- Keep `.env`, OAuth credentials, service-account JSON, private keys, caches, logs,
  and local virtual environments out of Git. `.gitignore` covers these paths.
- `.env.example` contains placeholders only. Every `VITE_*` value is public and
  appears in the frontend build; use it only for URLs and feature flags.
- The public demo contains rendered PNGs and recorded analysis JSON from public
  datasets. It contains no Earth Engine tile/thumbnail URLs, tokens, or secrets.
- Pages deployment uses the temporary GitHub Actions token with `contents: read`,
  `pages: write`, and `id-token: write`. Do not add a personal access token or GEE
  credentials to this workflow.
- A backend deployed separately needs its own authentication, rate limiting,
  single-process job policy, and exact CORS origin before public use. CORS alone
  does not protect an analysis endpoint or its compute quota.

Before publishing changes, run Gitleaks on staged source and the generated build:

```sh
gitleaks git --pre-commit --staged --redact --no-banner .
gitleaks dir --redact --no-banner frontend/dist
```

If a credential was ever exposed, revoke or rotate it at the issuer first, then
remove it from source and history. Do not post secrets in GitHub issues.
