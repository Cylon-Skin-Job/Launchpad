# Launchpad — Full Context Document
*Generated Feb 27, 2026. Use this to restore context in a new chat.*

---

## What This Project Is

Launchpad is a **personal remote CLI orchestration tool**. The goal:

- You run `kimi --wire` on a laptop in your closet
- You control it from your phone (browser UI)
- Firebase is the message bus between phone and laptop
- Pipelines and templates define the AI workflows
- This is a personal tool — one user, one laptop, one Firebase project

**Firebase Project:** `launchpad-ai-orchestrator`  
**Hosting:** https://launchpad-ai-orchestrator.web.app  
**GitHub:** https://github.com/Cylon-Skin-Job/Launchpad  
**GitLab:** https://gitlab.com/Cylon-Skin-Job/LaunchPad  

---

## What Was Fixed (Previous Session)

The codebase had 6 competing auth systems, 3 chat implementations, 15+ dead files, and committed secrets. All of that was cleaned up:

### Deleted (dead code)
- 15 auth files: `AuthContext`, `AuthGate`, `HardcodedAuth`, `SimpleAuth`, `KeychainAuth`, `PasswordOnly`, `SessionKicked`, `service.ts`, `token-service.ts`, `session-service.ts`, `user-service.ts`, `types.ts`, `PasswordGate`, `PairingGate`
- 7 chat files: `chat-service-v2.ts`, old `service.ts`, `ThreadItem`, `ThreadList`, `thread-service.ts`, `chat/types.ts`, `useThreads.ts`
- 8 bridge experiments: `bridge-client.js`, `bridge-client-v2.js`, `bridge-firestore.js`, `bridge-firestore-v2.js`, `bridge-pairing.js`, `bridge-password.js`, `bridge-simple.js`, `bridge-sync.js`
- `test_keys.js`, all `server/wire-bridge/` content

### Built (replacement auth)
New single-token pairing auth system:

**`src/auth/AuthProvider.tsx`** — token stored in `localStorage`, validated against `system/pairing` Firestore doc. If Firebase unreachable: shows error, does NOT silently trust stored token.

**`src/auth/PairScreen.tsx`** — one-time token entry UI. You paste the token from bridge output once. Stored on phone, stored on laptop, mirrored in Firebase.

**`src/auth/index.ts`** — barrel export

**Auth flow:**
1. Bridge runs on laptop, generates `LP-xxxxxxxx` token, writes to `~/.launchpad-token`
2. Bridge writes token to `system/pairing` in Firestore
3. Phone opens app, sees PairScreen, pastes token
4. App validates against Firestore, stores in localStorage
5. Done. Token persists 30 days.

**Security fix:** Original code had a `catch` block that silently trusted localStorage if Firebase was unreachable. That was removed. If Firebase is down, auth fails with a visible error message.

### Token propagation chain
```
App.tsx (useAuth token)
  → WireChatContainer (token prop)
    → WireChat (token prop)
      → createChatService (token param)
        → chat_prompts doc { token: "LP-xxx" }
          → Cloud Function validates against system/pairing
```

### Cloud Function security
`functions/src/chat-bridge.ts` — `onChatPromptCreated` now validates the pairing token before processing any prompt. Invalid/missing token → status set to `failed`.

---

## Current Codebase Structure

```
Launchpad/
├── src/                          # React frontend (Vite + TypeScript)
│   ├── auth/
│   │   ├── AuthProvider.tsx      # Token pairing auth context
│   │   ├── PairScreen.tsx        # One-time token entry UI
│   │   └── index.ts              # Barrel export
│   ├── components/
│   │   ├── WireChat.tsx          # Chat UI component (accepts token prop)
│   │   └── WireChatContainer.tsx # Chat container (passes token down)
│   ├── hooks/
│   │   └── usePipelines.ts       # Pipeline list hook
│   ├── pipeline/                 # Pipeline types and services
│   ├── services/
│   │   ├── firebase.ts           # Firebase init (db only, no auth SDK)
│   │   └── pipeline-sync.ts      # Pipeline sync service
│   ├── wire-chat/
│   │   └── chat-service.ts       # Firestore chat service (sends prompts)
│   ├── App.tsx                   # Main app (uses AuthProvider)
│   └── index.tsx                 # Entry point (no extra providers)
│
├── functions/src/                # Cloud Functions (Firebase)
│   ├── index.ts                  # ⚠️ ONLY EXPORTS: onChatPromptCreated, relayHealth
│   ├── chat-bridge.ts            # Active: Firestore trigger → WebSocket relay
│   ├── types/index.ts            # ALL type definitions (see schema below)
│   ├── jobs/index.ts             # createJob, claimJob, getJob, listJobs, cancelJob
│   ├── templates/index.ts        # listTemplates, getTemplate, createTemplate, etc.
│   ├── orchestrator/index.ts     # processRun, submitStageResult, pauseRun, etc.
│   ├── orchestrator/executor.ts  # executeStage, validateArtifact
│   ├── state-machine/index.ts    # determineNextStage, calculateProgress, etc.
│   ├── ledger/index.ts           # writeLedgerEntry, queryLedger, getRunHistory
│   ├── queue/index.ts            # getQueueStatus, getJobStatus
│   ├── event-log/index.ts        # queryEventLog, getEventStats, getPrintout
│   ├── delegation/index.ts       # createDelegatedJob, claimDelegatedJob, etc.
│   └── triggers/onTemplateWrite.ts # onTemplateWrite, syncAllTemplatesHttp
│
├── bridge.js                     # Laptop bridge (needs fixing — see below)
├── relay-service/server.js       # WebSocket relay on Cloud Run
├── pipelines/                    # LOCAL CACHE ONLY — not source of truth
└── ARCHITECTURE_V3.md            # System architecture doc
```

---

## ⚠️ Critical Problem: Functions Not Exported

`functions/src/index.ts` currently only exports:
```typescript
export { onChatPromptCreated, relayHealth } from './chat-bridge';
```

**All orchestration functions exist in source but are NOT deployed.** They won't work until exported:
- `createJob`, `claimJob`, `getJob`, `listJobs`, `cancelJob`
- `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `renderTemplate`
- `getQueueStatus`, `getJobStatus`
- `queryEventLog`, `getEventStats`, `getPrintout`
- `onTemplateWrite`, `syncAllTemplatesHttp`, `scheduledTemplateSync`

---

## Firebase Schema (Complete)

### `/jobs/{jobId}`
```typescript
{
  status: 'pending' | 'claimed' | 'running' | 'complete' | 'failed' | 'cancelled',
  request: {
    title: string,
    description: string,
    spec?: string,           // Full spec text
    repository?: string,     // GitHub/GitLab repo URL
    branch?: string,
  },
  pipelineId: string,        // Which pipeline to run
  priority: number,          // 1-10, higher = more urgent (default: 5)
  userId?: string,
  threadId?: string,
  spec?: {
    type: 'prep' | 'launch' | 'deploy',
    command?: string,
    args?: Record<string, unknown>,
  },
  currentStep?: number,
  totalSteps?: number,
  logs?: string[],           // Append-only log lines
  pausedForInput?: boolean,
  requiredInput?: string,
  providedInput?: string,
  assignedWorker?: string,
  claimedAt?: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  runId?: string,            // Set when job is claimed
  error?: string,
}
```

**Job lifecycle:** `pending → claimed → running → complete | failed | cancelled`

### `/runs/{runId}`
Created atomically when a job is claimed.
```typescript
{
  jobId: string,
  status: 'running' | 'paused' | 'complete' | 'failed',
  currentStage: Stage,
  stageStatus: 'pending' | 'in_progress' | 'success' | 'failure' | 'blocked',
  pipelineId: string,
  stages: Stage[],           // Ordered stage list
  currentStageIndex: number,
  context: {
    request: string,         // Original request text
    repoSnapshot?: string,   // RS.md content
    plan?: string,
    priorOutputs?: Record<Stage, any>,
    [key: string]: any,      // Arbitrary context
  },
  startedAt: Timestamp,
  completedAt?: Timestamp,
  lastActivityAt: Timestamp,
  retryCount: number,
  maxRetries: number,        // default: 3
  assignedWorker?: string,
  result?: 'success' | 'failure' | 'cancelled',
  summary?: string,
}
```

### `/runs/{runId}/artifacts/{stage}`
Subcollection. One doc per stage, keyed by stage name.
```typescript
{
  runId: string,
  stage: Stage,
  content: string,           // Full markdown content
  templateId: string,
  renderedContext: Record<string, any>,
  status: 'generated' | 'validated' | 'rejected',
  validationErrors?: string[],
  createdAt: Timestamp,
  updatedAt: Timestamp,
  model?: string,
  workerId?: string,
}
```

### `/ledger/{entryId}`
Append-only. Never update, only write.
```typescript
{
  runId: string,
  jobId: string,
  stage?: Stage,
  type: 'RUN_CREATED' | 'STAGE_STARTED' | 'STAGE_COMPLETED' | 'STAGE_FAILED'
       | 'STAGE_RETRY' | 'STAGE_BLOCKED' | 'ARTIFACT_CREATED'
       | 'ARTIFACT_VALIDATED' | 'CONTEXT_UPDATED' | 'RUN_COMPLETED' | 'RUN_FAILED',
  status?: string,
  message: string,
  details?: Record<string, any>,
  artifactIds?: string[],
  contextSnapshot?: Record<string, any>,
  workerId?: string,
  model?: string,
  timestamp: Timestamp,
  sequence: number,          // Monotonic per run, starts at 1
}
```

### `/templates/{templateId}`
Pipeline template definitions. Source of truth is Firebase, not local `/pipelines/` dir.
```typescript
{
  // Fields defined in functions/src/templates/types.ts
  // Accessed via: listTemplates, getTemplate, createTemplate, updateTemplate
}
```

### `/chat_prompts/{promptId}`
Created by frontend when user sends a message.
```typescript
{
  userId: string,
  threadId: string,
  sessionId: string,
  content: string,
  token: string | null,      // Pairing token for auth validation
  status: 'pending' | 'processing' | 'completed' | 'failed',
  createdAt: Timestamp,
  error?: string,            // Set if validation fails
}
```

### `/system/pairing`
Single document. Stores the active pairing token.
```typescript
{
  token: string,             // e.g. "LP-a3f9b2c1"
  updatedAt: number,         // Date.now()
}
```

### Pipeline Stages (DEFAULT_PIPELINE)
```
REQUEST → REPO_SNAPSHOT → PLAN → PLAN_VALIDATE → PLAN_CHECK
→ WORK → VALIDATE_SPEC → VALIDATE_EXEC → REVIEW → APPROVAL
→ COMMIT → FINAL_REPORT
```

---

## The Bridge (`bridge.js`) — Current Status + Problems

### What it does
Runs on laptop. Connects to WebSocket relay on Cloud Run. Spawns `kimi --wire`. Reads token from `~/.launchpad-token`, writes to Firestore `system/pairing`, waits for prompts from relay, pipes to Kimi.

### Critical bugs in current bridge.js

**Bug 1: Not valid JSON-RPC**
```javascript
// WRONG — line 123
const payload = JSON.stringify({ type: 'prompt', user_input: msg.user_input }) + '\n';
```
This is not JSON-RPC 2.0. Kimi requires:
```javascript
// CORRECT
const payload = JSON.stringify({
  jsonrpc: "2.0",
  method: "prompt",
  id: crypto.randomUUID(),
  params: { user_input: msg.user_input }
}) + '\n';
```

**Bug 2: No initialize handshake**
Must send `initialize` first to negotiate protocol v1.4.

**Bug 3: Never responds to ApprovalRequests**
Without `--yolo`, Kimi blocks at every tool call waiting for `approve`/`reject`. Bridge never sends it → Kimi hangs forever. This is why the bridge never worked.

**Bug 4: Never responds to ToolCallRequests**
Same hang for external tool calls.

**Bug 5: Blind stdout forwarding**
Parses stdout as JSON but doesn't route different message types correctly. All events (ContentPart, ToolCall, TurnEnd, etc.) get lumped together.

---

## Kimi CLI Wire Mode — Full Protocol Reference

### Start
```bash
kimi --wire          # blocks at tool calls (use for gate control)
kimi --wire --yolo   # auto-approves everything (use for full automation)
kimi-agent           # Rust version, lighter, wire-only
```

### Protocol: JSON-RPC 2.0, one line per message, stdin/stdout

**Client → Agent (you send these):**

| Method | Purpose |
|--------|---------|
| `initialize` | Handshake, declare capabilities, register external tools |
| `prompt` | Send user input, start a turn |
| `steer` | Inject message into ACTIVE turn (mid-turn steering) |
| `cancel` | Abort current turn |
| `replay` | Replay session from `wire.jsonl` history |

**Agent → Client (you receive these):**

Notifications (no response needed):
- `event: TurnBegin` — turn started
- `event: TurnEnd` — turn finished (Wire 1.2+)
- `event: StepBegin { n }` — step number
- `event: ContentPart { type: "text", text: "..." }` — streaming text output
- `event: ContentPart { type: "think", think: "..." }` — thinking output
- `event: ToolCall { id, name, arguments }` — tool being called
- `event: ToolResult { tool_call_id, return_value }` — tool result
- `event: StatusUpdate { context_usage, token_usage }` — context/token info
- `event: SubagentEvent` — nested subagent output

Requests (MUST respond or Kimi blocks):
- `request: ApprovalRequest` → respond with `{ request_id, response: "approve"|"approve_for_session"|"reject" }`
- `request: ToolCallRequest` → respond with `{ tool_call_id, return_value: { is_error, output, message, display } }`
- `request: QuestionRequest` → respond with `{ request_id, answers: { "question text": "selected option" } }`

### Initialize request example
```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "id": "uuid-here",
  "params": {
    "protocol_version": "1.4",
    "client": { "name": "launchpad-bridge", "version": "2.0.0" },
    "capabilities": { "supports_question": true }
  }
}
```

### Prompt request example
```json
{
  "jsonrpc": "2.0",
  "method": "prompt",
  "id": "uuid-here",
  "params": { "user_input": "Review this code and suggest improvements" }
}
```

### Steer request example (mid-turn injection)
```json
{
  "jsonrpc": "2.0",
  "method": "steer",
  "id": "uuid-here",
  "params": { "user_input": "Focus only on security issues" }
}
```

---

## Architecture: Gate Controller Pattern

### The Core Idea
Without `--yolo`, Kimi blocks at every tool call and sends an `ApprovalRequest`. This is your control plane. Every tool call becomes a gate you can inspect, approve, reject, or redirect from your phone.

### Gate Flow
```
Prompt → Kimi thinks → ToolCall
                          ↓
                    ApprovalRequest arrives at bridge
                          ↓
                    Bridge writes gate doc to Firebase
                    { tool, command, status: "pending" }
                          ↓
                    Bridge checks policy:
                    ├── Auto-approve? (read-only tools)
                    ├── Pipeline stage says "hold"?
                    ├── Phone UI has "watch mode" on?
                    └── Budget/token limit exceeded?
                          ↓
              ┌── Auto: respond "approve" immediately
              ├── Gated: wait for Firebase doc update
              └── Rejected: respond "reject", Kimi adapts
                          ↓
                    Next tool call → next gate → repeat
                          ↓
                    TurnEnd → stage complete → next stage
```

### Proposed New Firebase Collections for Gate Control

**`/gates/{gateId}`** — one per approval request
```typescript
{
  runId: string,
  stageId: string,
  tool: string,              // "Shell", "Read", "Write", etc.
  action: string,            // "run shell command", etc.
  description: string,       // "Run command `npm install`"
  policy: 'auto' | 'hold' | 'reject',
  status: 'pending' | 'approved' | 'rejected',
  decidedBy: null | 'policy' | 'human' | 'pipeline',
  createdAt: Timestamp,
  resolvedAt: Timestamp | null,
}
```

**`/policies/{policyId}`** — gate rules per pipeline stage
```typescript
{
  pipelineId: string,
  stage: string,
  rules: Array<{
    tool: string,            // "Shell" | "Read" | "Write" | "*"
    action: 'auto' | 'hold' | 'reject',
  }>,
}
```

### Steer from Phone
Wire 1.4 `steer` method lets you inject messages into an active turn:
1. Kimi is mid-turn executing a pipeline stage
2. You see from phone it's going off-track
3. Write a steer doc to Firebase: `{ steer: "Focus only on X" }`
4. Bridge picks it up, sends `steer` to Kimi via stdin
5. Kimi adjusts — no restart, no new turn

### Mapping Gate Control to Existing Orchestrator Functions
| Existing function | Gate control mapping |
|---|---|
| `processRun` | Send `prompt` to Kimi |
| `pauseRun` | Set all pending gates to `"hold"` |
| `resumeRun` | Release all held gates |
| `cancelRun` | Send `cancel` to Kimi |
| `submitStageResult` | Final output of a completed turn |
| New: `steerRun` | Send `steer` mid-turn |
| New: `approveGate` | Approve a specific gate, release Kimi |
| New: `rejectGate` | Reject a gate, Kimi picks another approach |

---

## The Correct Bridge Architecture

What the fixed `bridge.js` needs to do:

```javascript
// 1. Spawn Kimi
const proc = spawn('kimi', ['--wire'], { stdio: ['pipe', 'pipe', 'pipe'] });

// 2. Initialize
sendToKimi({ jsonrpc: "2.0", method: "initialize", id: uuid(), params: {
  protocol_version: "1.4",
  client: { name: "launchpad-bridge", version: "2.0.0" },
  capabilities: { supports_question: true }
}});

// 3. Wait for initialize response before sending prompts

// 4. On prompt from Firebase/relay:
sendToKimi({ jsonrpc: "2.0", method: "prompt", id: uuid(), params: {
  user_input: msg.content
}});

// 5. Read stdout line by line, parse JSON-RPC:
//    - event: ContentPart → forward text to phone
//    - request: ApprovalRequest → write gate to Firebase, respond based on policy
//    - request: ToolCallRequest → execute tool, respond with result
//    - request: QuestionRequest → forward to phone, wait for answer
//    - prompt result → mark stage complete
```

---

## Phoenix / Agent Comms System (Separate Project)

GitLab repo: `Cylon-Skin-Job/phoenix` (ID: 79652956)

This is a file-based bulletin board messaging system used for agent coordination. NOT part of Launchpad directly, but the pattern is worth stealing:

### Structure
```
bulletin-board/
  pending/      ← new tasks from RC
  in-progress/  ← claimed tasks
  completed/    ← finished with results
  outbox/       ← daily reports
  agents/       ← specialist agent prompts (backend.md, frontend.md, validator.md)
```

### Task format (markdown file in pending/)
```markdown
# Task Title

**Agent:** backend|frontend|validator

**Task:** Description of what needs to be done

**Requirements:**
- Specific requirement 1

**Testing:** How to verify completion

**Timestamp:** 2026-02-27T18:00:00Z
```

### Email bridge
- Inbox: `phoenix_claw@agentmail.to`
- API: `https://api.agentmail.to/v0/inboxes/{inbox}/messages`
- Auth: Bearer token
- Also has `check-email.sh` poller script

### phoenix-command (separate repo, ID: 79657308)
Node.js/Express + SSE real-time web UI. Different from file-based phoenix. Uses `data/tasks.json` for persistence. Visual kanban board.

### The pattern to steal for Launchpad
Don't use OpenClaw/AgentMail — keep it all in Firebase. Steal the mailbox design:
1. Inbound message arrives → write to Firestore `inbound_messages/{id}` with status `pending`
2. Worker/bridge subscribes, processes exactly once
3. Mark status `processing` before handling, `done`/`failed` after
4. Write reply to `outbound_messages/{id}`
5. UI subscribes to both collections for real-time display

---

## What Needs to Be Built Next

### Priority 1: Fix the bridge
Rewrite `bridge.js` to use correct JSON-RPC 2.0 wire protocol. Must:
- Send `initialize` handshake first
- Use proper `prompt` request format
- Handle `ApprovalRequest` (either auto-approve with `--yolo` or implement gate system)
- Parse stdout events properly and route `ContentPart` text to relay/Firestore
- Handle reconnection cleanly

### Priority 2: Export all Cloud Functions
Update `functions/src/index.ts` to export all the orchestration functions that already exist in source. They're all written — just not wired up.

### Priority 3: Gate controller
Add `gates` and `policies` collections to Firebase schema. Implement gate check logic in bridge. Add phone UI to review/approve gates.

### Priority 4: Steer UI
Add a "steer" input on the phone that writes to Firebase and gets picked up by bridge mid-turn.

---

## Environment

```
Firebase Project: launchpad-ai-orchestrator
Hosting: https://launchpad-ai-orchestrator.web.app
Cloud Run Relay: wss://wire-relay-300613489456.us-central1.run.app
Token file: ~/.launchpad-token
GitLab token: ~/.config/phoenix-gitlab.env (GITLAB_TOKEN=glpat-...)
```

### Key commands
```bash
npm run dev                          # local dev server (localhost:3000)
firebase deploy --only functions     # deploy functions
firebase deploy --only hosting       # deploy UI
node bridge.js                       # run laptop bridge
firebase functions:log               # check function logs
gcloud auth print-identity-token     # get auth token for API calls
```

---

*Firebase is the source of truth. Wire mode is the control plane. The bridge is the missing link.*
