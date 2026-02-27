/**
 * onGitLabPush — First ability.
 *
 * HTTP function triggered by GitLab push webhook.
 * Evaluates markdown file diffs via Cerebras LLM and commits corrections back.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getDiff, getFileContent, commitFiles } from "./lib/gitlab";
import { evaluateDiff } from "./lib/cerebras";

// Initialize Firebase Admin (idempotent)
if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();

// Secrets
const gitlabToken = defineSecret("GITLAB_TOKEN");
const cerebrasApiKey = defineSecret("CEREBRAS_API_KEY");
const webhookSecret = defineSecret("GITLAB_WEBHOOK_SECRET");

export const onGitLabPush = onRequest(
  { secrets: [gitlabToken, cerebrasApiKey, webhookSecret] },
  async (req, res) => {
    // Only accept POST
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Verify webhook token
    const token = req.headers["x-gitlab-token"];
    if (token !== webhookSecret.value()) {
      res.status(401).send("Invalid webhook token");
      return;
    }

    const payload = req.body;

    // Ignore non-push or tag events
    if (payload.object_kind !== "push") {
      res.status(200).send("Ignored: not a push event");
      return;
    }

    // Ignore branch deletions (after = all zeros)
    if (payload.after === "0000000000000000000000000000000000000000") {
      res.status(200).send("Ignored: branch deletion");
      return;
    }

    const projectId: number = payload.project?.id;
    const beforeSha: string = payload.before;
    const afterSha: string = payload.after;
    const branch: string = (payload.ref as string).replace("refs/heads/", "");

    if (!projectId || !beforeSha || !afterSha) {
      res.status(400).send("Missing project ID or commit SHAs");
      return;
    }

    const glToken = gitlabToken.value();

    try {
      // 1. Get the diff
      const compare = await getDiff(glToken, projectId, beforeSha, afterSha);

      // 2. Filter to .md files only
      const mdDiffs = compare.diffs.filter(
        (d) => d.new_path.endsWith(".md") && !d.deleted_file
      );

      if (mdDiffs.length === 0) {
        res.status(200).send("No markdown files changed");
        return;
      }

      // 3. Fetch full content for each changed md file
      const files = await Promise.all(
        mdDiffs.map(async (d) => ({
          path: d.new_path,
          content: await getFileContent(glToken, projectId, d.new_path, afterSha),
        }))
      );

      // 4. Build combined diff string
      const diffText = mdDiffs.map((d) => d.diff).join("\n\n");

      // 5. Send to Cerebras for evaluation
      const result = await evaluateDiff(cerebrasApiKey.value(), diffText, files);

      // 6. If corrections suggested, commit them back
      let commitId: string | null = null;
      if (result.edits.length > 0) {
        const actions = result.edits.map((edit) => ({
          action: "update" as const,
          file_path: edit.file_path,
          content: edit.content,
        }));

        const commit = await commitFiles(
          glToken,
          projectId,
          branch,
          `docs: auto-correct markdown (Launchpad agent)\n\n${result.reasoning}`,
          actions
        );
        commitId = commit.id;
      }

      // 7. Log to Firestore
      await db.collection("agent_actions").add({
        type: "onGitLabPush",
        projectId,
        branch,
        beforeSha,
        afterSha,
        mdFilesEvaluated: files.map((f) => f.path),
        editsApplied: result.edits.length,
        reasoning: result.reasoning,
        commitId,
        timestamp: FieldValue.serverTimestamp(),
      });

      res.status(200).json({
        evaluated: files.length,
        corrections: result.edits.length,
        commitId,
        reasoning: result.reasoning,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("onGitLabPush error:", message);

      // Log failure
      await db.collection("agent_actions").add({
        type: "onGitLabPush",
        projectId,
        branch,
        error: message,
        timestamp: FieldValue.serverTimestamp(),
      });

      res.status(500).send(`Internal error: ${message}`);
    }
  }
);
