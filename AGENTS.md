# Launchpad

Headless Firebase agent. No frontend, no server — just Cloud Functions triggered by webhooks and schedules.

## Architecture

```
GitLab push → Firebase Function → Cerebras LLM → GitLab commit
```

All functions live in `functions/src/`. Each ability is one file, exported from `index.ts`.

## Project

- Firebase project: `launchpad-ai-orchestrator`
- Runtime: Node.js 20, TypeScript
- Secrets managed via `firebase functions:secrets:set`

## First Ability: `onGitLabPush`

HTTP function triggered by GitLab push webhook. Evaluates markdown file diffs via Cerebras LLM and commits corrections back.

## Adding New Abilities

1. Create `functions/src/onNewAbility.ts`
2. Export from `functions/src/index.ts`
3. Deploy: `cd functions && npm run deploy`

## Secrets

- `GITLAB_TOKEN` — GitLab personal access token
- `CEREBRAS_API_KEY` — Cerebras API key
- `GITLAB_WEBHOOK_SECRET` — Webhook verification token

## Git Remotes

Dual push configured: `git push origin master` hits both GitHub and GitLab.
