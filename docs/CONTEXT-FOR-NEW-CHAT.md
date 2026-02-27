# Launchpad — Context for New Chat
*Generated Feb 27, 2026. Load this at the start of any new session.*

---

## What This Project Is

Launchpad is a **headless Firebase agent**. No frontend, no server, no bridge, no laptop required. Firebase Cloud Functions are the execution layer. LLM API calls (Cerebras) are the intelligence. GitLab is the first integration.

The core idea: **each Cloud Function is one ability**. Add abilities one at a time. The agent grows.

---

## Why We Rebuilt From Scratch

The previous architecture routed prompts through Kimi CLI on a laptop to avoid paying for LLM tokens. It required a WebSocket relay on Cloud Run, a bridge process, a wire protocol, a pairing token system, and a React frontend. All of that was complexity tax for the wrong tradeoff. We killed it and went fully cloud-native with paid API tokens.

---

## Firebase Project

```
Project ID:     launchpad-ai-orchestrator
Project Number: 300613489456
Console:        https://console.firebase.google.com/project/launchpad-ai-orchestrator
Hosting:        (none — no frontend)
```

Firebase CLI is authenticated. Run `firebase projects:list` to verify.

---

## Credentials & Secrets

### GitLab Token
- **File:** `~/.config/phoenix-gitlab.env`
- **Value:** `GITLAB_TOKEN=glpat-Zxbplo8wSyEKMllKxPXAHG86MQp1Ompxd3IxCw.01.120f5a82x`
- **Also in Secret Manager** as `GITLAB_TOKEN`

### All Secrets in Google Cloud Secret Manager
Three secrets, all stored under project `launchpad-ai-orchestrator`:

| Secret Name | What It Is |
|---|---|
| `GITLAB_TOKEN` | GitLab personal access token (`glpat-...`) |
| `CEREBRAS_API_KEY` | Cerebras inference API key (`csk-...`) |
| `GITLAB_WEBHOOK_SECRET` | Shared secret for webhook verification (`74af61beb39b4ec6945828f9988a9ad8c83efdf3`) |

Access any secret value via:
```bash
gcloud secrets versions access latest --secret=SECRET_NAME --project=launchpad-ai-orchestrator
```

### Webhook Secret
```
74af61beb39b4ec6945828f9988a9ad8c83efdf3
```
This goes in GitLab's webhook config as the "Secret Token". The function checks it against `X-Gitlab-Token` header.

---

## GitLab

```
Account:    Cylon-Skin-Job
Repo:       https://gitlab.com/Cylon-Skin-Job/LaunchPad
API base:   https://gitlab.com/api/v4
Auth:       PRIVATE-TOKEN header
```

To get the numeric project ID (needed for API calls):
```bash
curl -s -H "PRIVATE-TOKEN: $(grep GITLAB_TOKEN ~/.config/phoenix-gitlab.env | cut -d= -f2)" \
  "https://gitlab.com/api/v4/projects/Cylon-Skin-Job%2FLaunchPad" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])"
```

---

## Cerebras API

```
API base:   https://api.cerebras.ai/v1
Auth:       Authorization: Bearer <CEREBRAS_API_KEY>
Model:      gpt-oss-120b   ← USE THIS ONE
```

Available models (as of Feb 27, 2026):
- `gpt-oss-120b` — primary, best quality
- `llama3.1-8b` — fast, cheap
- `qwen-3-235b-a22b-instruct-2507` — large, slower
- `zai-glm-4.7` — alternative

Live test (confirm API is working):
```bash
CEREBRAS_KEY=$(gcloud secrets versions access latest --secret=CEREBRAS_API_KEY --project=launchpad-ai-orchestrator) && \
curl -s https://api.cerebras.ai/v1/chat/completions \
  -H "Authorization: Bearer $CEREBRAS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-oss-120b","messages":[{"role":"user","content":"Say hello in 5 words."}],"max_tokens":20}'
```

---

## Git Remotes (Dual Push)

`git push origin master` hits both GitHub and GitLab simultaneously:

```
origin  https://github.com/Cylon-Skin-Job/Launchpad.git (fetch)
origin  https://github.com/Cylon-Skin-Job/Launchpad.git (push)
origin  https://gitlab.com/Cylon-Skin-Job/LaunchPad.git (push)
gitlab  https://gitlab.com/Cylon-Skin-Job/LaunchPad.git (fetch)
gitlab  https://gitlab.com/Cylon-Skin-Job/LaunchPad.git (push)
```

---

## Codebase Structure

```
Launchpad/
├── functions/
│   ├── src/
│   │   ├── index.ts              # Exports all abilities
│   │   ├── onGitLabPush.ts       # Ability 1
│   │   └── lib/
│   │       ├── gitlab.ts         # GitLab API client
│   │       └── cerebras.ts       # Cerebras LLM client
│   ├── package.json              # firebase-functions, @cerebras/cerebras_cloud_sdk ^1.64.1
│   └── tsconfig.json
├── .firebaserc                   # project: launchpad-ai-orchestrator
├── firebase.json                 # functions only, no hosting
├── firestore.rules               # deny all client access (Admin SDK bypasses)
├── firestore.indexes.json
├── .gitignore
├── AGENTS.md
├── README.md
└── docs/
    └── CONTEXT-FOR-NEW-CHAT.md   # this file
```

---

## Ability 1: `onGitLabPush`

**Status: Built, not yet deployed. Webhook not yet registered in GitLab.**

HTTP function triggered by GitLab push webhook. What it does:

1. Verifies `X-Gitlab-Token` header against `GITLAB_WEBHOOK_SECRET`
2. Rejects non-push events and branch deletions
3. Fetches diff from GitLab API (`/projects/:id/repository/compare`)
4. Filters to `.md` files only — ignores all other files
5. Fetches full current content of each changed md file
6. Sends diff + file contents to `gpt-oss-120b` on Cerebras
7. If corrections returned, commits them back to the repo via GitLab API
8. Logs everything to Firestore `agent_actions` collection

**To deploy:**
```bash
cd /Users/rccurtrightjr./projects/Launchpad/functions
npm run build
firebase deploy --only functions --project launchpad-ai-orchestrator
```

**After deploying, register webhook in GitLab:**
- Settings → Webhooks → Add new webhook
- URL: `https://us-central1-launchpad-ai-orchestrator.cloudfunctions.net/onGitLabPush`
- Secret Token: `74af61beb39b4ec6945828f9988a9ad8c83efdf3`
- Trigger: Push events
- Branch filter: `master` (optional)

---

## Firestore Collections

| Collection | Purpose |
|---|---|
| `agent_actions` | Audit log — every action the agent takes |
| `templates` | Pipeline templates (preserved from old system) |
| `jobs` | Job definitions (preserved from old system) |
| `runs` | Run history (preserved from old system) |
| `ledger` | Append-only event log (preserved from old system) |

---

## Pattern for Adding New Abilities

1. Create `functions/src/onNewAbility.ts`
2. Export from `functions/src/index.ts`
3. Add secrets to function declaration if needed
4. Build and deploy: `cd functions && npm run deploy`

Every ability follows: **trigger → fetch context → LLM thinks → act → log to Firestore**

---

## Key Commands

```bash
# Deploy functions
cd functions && npm run build && firebase deploy --only functions

# Check function logs
firebase functions:log --project launchpad-ai-orchestrator

# Add a new secret
firebase functions:secrets:set SECRET_NAME --project launchpad-ai-orchestrator

# List all secrets
gcloud secrets list --project=launchpad-ai-orchestrator

# Get a secret value
gcloud secrets versions access latest --secret=SECRET_NAME --project=launchpad-ai-orchestrator

# Push to both GitHub and GitLab
git push origin master
```

---

*Firebase is the agent. Cerebras is the brain. GitLab is the first integration. Abilities grow one function at a time.*
