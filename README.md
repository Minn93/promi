# Promi

Next.js app for product promotions, scheduled posts, connected social accounts, and a **platform-extensible** publish pipeline (3차: X OAuth + real text publish path, mock publishers for other platforms, scheduler + history).

## Quick start

```bash
npm install
npm run check:internal-beta
npm run validate:owner-ids
npm run preflight:internal-beta
npm run dev
```

Owner-isolation adversarial smoke (release rehearsal signal):

```bash
npm run smoke:owner-isolation
```

Use in dedicated non-prod rehearsal environments. This is not part of default PR preflight.

Open [http://localhost:3000](http://localhost:3000).

## Documentation

- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** — environment variables, mock vs real X, local scheduler trigger, sanity checklist.
- **[docs/INTERNAL_BETA_CHECKLIST.md](docs/INTERNAL_BETA_CHECKLIST.md)** — internal beta safety checks and guardrails.
- **[docs/INTERNAL_BETA_RUNBOOK.md](docs/INTERNAL_BETA_RUNBOOK.md)** — deployment preflight, post-deploy smoke tests, and rollback steps.
- **[docs/INTERNAL_BETA_RELEASE_REHEARSAL.md](docs/INTERNAL_BETA_RELEASE_REHEARSAL.md)** — go/no-go criteria, rollback triggers, and evidence template for release rehearsal.

## Stack

[Next.js](https://nextjs.org), React, Prisma (Postgres), Tailwind CSS.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) with [Geist](https://vercel.com/font).
