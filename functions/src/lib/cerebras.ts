/**
 * Cerebras LLM client — evaluates diffs and suggests corrections.
 */

import Cerebras from "@cerebras/cerebras_cloud_sdk";

const MODEL = "gpt-oss-120b";

interface FileEdit {
  file_path: string;
  content: string;
}

interface EvalResult {
  edits: FileEdit[];
  reasoning: string;
}

/**
 * Evaluate a diff against current file contents.
 * Returns suggested corrections (or empty edits if nothing to fix).
 */
export async function evaluateDiff(
  apiKey: string,
  diff: string,
  files: Array<{ path: string; content: string }>
): Promise<EvalResult> {
  const client = new Cerebras({
    apiKey,
    warmTCPConnection: false,
  });

  const fileList = files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a documentation reviewer. You receive a git diff and the current content of changed markdown files. Your job is to identify stale, incorrect, or inconsistent documentation and suggest corrections.

Respond with JSON only. Format:
{
  "reasoning": "Brief explanation of what you found",
  "edits": [
    { "file_path": "path/to/file.md", "content": "full corrected file content" }
  ]
}

If nothing needs correction, return: { "reasoning": "No issues found", "edits": [] }

Rules:
- Only fix real problems: broken references, stale info, factual errors, inconsistencies with the diff
- Do NOT reformat, restyle, or make cosmetic changes
- Return the FULL corrected file content for each edit, not a patch`,
      },
      {
        role: "user",
        content: `## Git Diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n\n## Current File Contents\n\n${fileList}`,
      },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const choices = completion.choices as any[];
  const raw: string = choices?.[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(raw);
    return {
      reasoning: parsed.reasoning ?? "No reasoning provided",
      edits: Array.isArray(parsed.edits) ? parsed.edits : [],
    };
  } catch {
    // LLM didn't return valid JSON — treat as no edits
    return {
      reasoning: `LLM response was not valid JSON: ${raw.slice(0, 200)}`,
      edits: [],
    };
  }
}

export type { FileEdit, EvalResult };
