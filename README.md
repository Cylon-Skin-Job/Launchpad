# Launchpad

Headless Firebase agent for automated code review. Receives GitLab push webhooks, evaluates diffs with Cerebras LLM, and commits corrections back.

## Setup

```bash
cd functions
npm install
npm run build
```

## Deploy

```bash
cd functions
npm run deploy
```

## Secrets

```bash
firebase functions:secrets:set GITLAB_TOKEN
firebase functions:secrets:set CEREBRAS_API_KEY
firebase functions:secrets:set GITLAB_WEBHOOK_SECRET
```
