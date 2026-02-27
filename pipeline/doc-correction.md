# Pipeline: Doc Correction

**Trigger:** GitLab push webhook  
**Ability:** `onGitLabPush`  
**Status:** Live

---

## What This Pipeline Does

On every push to the GitLab repo, evaluates whether any changed markdown files are stale, incorrect, or inconsistent with the code changes — and commits corrections back automatically.

---

## Flow

```
git push origin master
    ↓
GitLab fires POST to Firebase function
    ↓
Function verifies X-Gitlab-Token header
    ↓
Function fetches diff from GitLab API
(GET /projects/:id/repository/compare?from=before&to=after)
    ↓
Filter to .md files only — skip everything else
    ↓
Fetch full content of each changed .md file
(GET /projects/:id/repository/files/:path/raw?ref=after)
    ↓
Send diff + file contents to DeepInfra LLM
Model: openai/gpt-oss-120b
Prompt: identify stale, broken, or inconsistent documentation
    ↓
LLM returns JSON: { reasoning, edits: [{ file_path, content }] }
    ↓
If edits.length > 0:
  Commit corrected files back to repo
  (POST /projects/:id/repository/commits)
  Message: "docs: auto-correct markdown (Launchpad agent)"
    ↓
Log action to Firestore: agent_actions/{id}
```

---

## Decision Points

**No .md files changed in push?**  
→ Return 200, do nothing. No LLM call, no cost.

**LLM returns no edits?**  
→ Log "No issues found", return 200. Docs are fine.

**LLM returns invalid JSON?**  
→ Log the raw response, treat as no edits. Fail safe.

**GitLab API error?**  
→ Log error to Firestore, return 500. No silent failures.

---

## LLM Prompt

**System:**
```
You are a documentation reviewer. You receive a git diff and the current 
content of changed markdown files. Your job is to identify stale, incorrect, 
or inconsistent documentation and suggest corrections.

Respond with JSON only. Format:
{
  "reasoning": "Brief explanation of what you found",
  "edits": [
    { "file_path": "path/to/file.md", "content": "full corrected file content" }
  ]
}

If nothing needs correction, return: { "reasoning": "No issues found", "edits": [] }

Rules:
- Only fix real problems: broken references, stale info, factual errors, 
  inconsistencies with the diff
- Do NOT reformat, restyle, or make cosmetic changes
- Return the FULL corrected file content for each edit, not a patch
```

**User:**
```
## Git Diff
<diff content>

## Current File Contents
<full content of each changed .md file>
```

---

## Infrastructure

| Component | Value |
|---|---|
| Function | `onGitLabPush` |
| Region | `us-central1` |
| Runtime | Node.js 20 |
| URL | `https://us-central1-launchpad-ai-orchestrator.cloudfunctions.net/onGitLabPush` |
| LLM | DeepInfra `openai/gpt-oss-120b` |
| Secrets | `GITLAB_TOKEN`, `DEEPINFRA_API_KEY`, `GITLAB_WEBHOOK_SECRET` |
| Audit log | Firestore `agent_actions` collection |

---

## GitLab Webhook Config

- **URL:** `https://us-central1-launchpad-ai-orchestrator.cloudfunctions.net/onGitLabPush`
- **Secret Token:** `74af61beb39b4ec6945828f9988a9ad8c83efdf3`
- **Trigger:** Push events only
- **SSL verification:** Enabled

---

## Source Files

```
functions/src/onGitLabPush.ts   — function entry point
functions/src/lib/gitlab.ts     — GitLab API client
functions/src/lib/deepinfra.ts  — DeepInfra LLM client (active)
functions/src/lib/cerebras.ts   — Cerebras LLM client (available)
```

---

## Testing

Make a push with a `.md` file that contains something intentionally stale or wrong. Watch for a follow-up commit from the agent. Check Firestore `agent_actions` for the log entry.

To check function logs:
```bash
firebase functions:log --project launchpad-ai-orchestrator
```

---

## Extending This Pipeline

To change what gets evaluated, edit the system prompt in `functions/src/lib/deepinfra.ts`.

To evaluate non-`.md` files, change the filter in `functions/src/onGitLabPush.ts` line 73:
```typescript
const mdDiffs = compare.diffs.filter(
  (d) => d.new_path.endsWith(".md") && !d.deleted_file
);
```
