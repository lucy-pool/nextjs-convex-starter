import { spawn, spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { scanDiagrams, matchChangedFiles, WATCHED_TREE_ROOTS } from "./diagram-watches";

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
}

interface TranscriptMessage {
  role: string;
  content: unknown;
}

interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input: Record<string, unknown>;
}

// ── Transcript parsing ──────────────────────────────────────────────

function getChangedFiles(transcriptPath: string): string[] {
  const changed = new Set<string>();
  try {
    const raw = readFileSync(transcriptPath, "utf-8");
    const lines = raw.split("\n").filter((line) => line.trim());
    const messages: TranscriptMessage[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.role) {
          messages.push(parsed as TranscriptMessage);
        } else if (parsed.type === "assistant" || parsed.message?.role) {
          const msg = parsed.message || parsed;
          if (msg.role) messages.push(msg as TranscriptMessage);
        }
      } catch {
        // Skip unparseable lines
      }
    }

    for (const msg of messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
      for (const block of msg.content) {
        const b = block as ToolUseBlock;
        if (b.type !== "tool_use") continue;
        if (b.name === "Write" || b.name === "Edit") {
          const fp = b.input?.file_path as string | undefined;
          if (fp) changed.add(fp);
        }
      }
    }
  } catch (e) {
    console.error("Failed to read transcript:", e);
  }
  return Array.from(changed);
}

// ── Shell helpers ───────────────────────────────────────────────────

function runCommand(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    proc.stdout.on("data", (d: Buffer) => {
      output += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      output += d.toString();
    });
    proc.on("close", (code) => {
      resolve({ code: code ?? 1, output });
    });
  });
}

// ── Convex file scanning ────────────────────────────────────────────

function getConvexTsFiles(convexDir: string): { filePath: string; relPath: string }[] {
  const results: { filePath: string; relPath: string }[] = [];

  function walk(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (
        entry.isDirectory() &&
        entry.name !== "_generated" &&
        entry.name !== "node_modules"
      ) {
        walk(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.endsWith(".d.ts") &&
        entry.name !== "tsconfig.json"
      ) {
        const relPath = fullPath.slice(convexDir.length + 1);
        results.push({ filePath: fullPath, relPath });
      }
    }
  }

  walk(convexDir);
  return results;
}

// ── Lint checks ─────────────────────────────────────────────────────

// Client-only packages that should never appear in convex/ server code
const CLIENT_ONLY_PACKAGES = [
  "react",
  "react-dom",
  "@radix-ui",
  "lucide-react",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "tailwindcss",
];

function checkUnusedGeneratedImports(cwd: string): string[] {
  const convexDir = join(cwd, "convex");
  const errors: string[] = [];
  const files = getConvexTsFiles(convexDir);

  for (const { filePath, relPath } of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const importRegex =
      /import\s+\{([^}]+)\}\s+from\s+["']\.?\/?_generated\/\w+["'];?/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importedNames = match[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const resolvedNames = importedNames.map((name) => {
        let n = name.replace(/^type\s+/, "");
        const asMatch = n.match(/^\S+\s+as\s+(\S+)$/);
        if (asMatch) n = asMatch[1];
        return n;
      });

      const contentWithoutImportLine = content.replace(match[0], "");
      for (const name of resolvedNames) {
        const usageRegex = new RegExp(`\\b${name}\\b`);
        if (!usageRegex.test(contentWithoutImportLine)) {
          errors.push(`convex/${relPath}: unused import "${name}" from _generated`);
        }
      }
    }
  }

  return errors;
}

function checkClientImportsInConvex(cwd: string): string[] {
  const convexDir = join(cwd, "convex");
  const errors: string[] = [];
  const files = getConvexTsFiles(convexDir);

  for (const { filePath, relPath } of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    // "use node" files run in Node.js and may legitimately use React (e.g. @react-email)
    if (/^["']use node["'];?\s*$/m.test(content)) continue;

    const importRegex = /import\s+.*?\s+from\s+["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const source = match[1];
      for (const pkg of CLIENT_ONLY_PACKAGES) {
        if (source === pkg || source.startsWith(pkg + "/")) {
          errors.push(
            `convex/${relPath}: imports client-only package "${source}"`
          );
        }
      }
    }
  }

  return errors;
}

// ── MCP error check (no-op — Next.js MCP removed after TanStack Start migration) ─

async function checkNextJsMcpErrors(_cwd: string): Promise<string | null> {
  // Next.js MCP endpoint no longer exists (migrated to TanStack Start)
  return null;
}

// ── Diagram maintenance ─────────────────────────────────────────────

const DIAGRAM_DIR = "memory/ai/diagrams";
const DIAGRAM_LOCK_FILE = "/tmp/lucystarter-diagram-update.lock";
const DEBOUNCE_SECONDS = 30;

function isDiagramUpdateDebounced(): boolean {
  try {
    if (!existsSync(DIAGRAM_LOCK_FILE)) return false;
    const stat = statSync(DIAGRAM_LOCK_FILE);
    const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
    return ageSeconds < DEBOUNCE_SECONDS;
  } catch {
    return false;
  }
}

function touchLockFile(): void {
  try {
    writeFileSync(DIAGRAM_LOCK_FILE, String(process.pid));
  } catch {
    // Best-effort
  }
}

/**
 * Detect whether the CLAUDE.md ## Architecture file tree likely needs an
 * update by looking at `git status --porcelain` for *structural* changes —
 * file adds, deletes, renames — inside watched tree roots. Pure content
 * edits (`M` / `AM`) do NOT trigger a tree refresh.
 */
function hasStructuralTreeChanges(cwd: string): boolean {
  let result;
  try {
    result = spawnSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
    });
  } catch {
    return false;
  }
  if (result.status !== 0 || !result.stdout) return false;

  const ignoredSuffixes = ["routeTree.gen.ts", "routeTree.gen.tsx"];
  const ignoredFragments = ["_generated/"];

  for (const line of result.stdout.split("\n")) {
    if (!line || line.length < 4) continue;
    // Porcelain v1: "XY <path>" (columns 0–1 = status, column 2 = space, then path).
    const x = line[0];
    const y = line[1];
    let path = line.slice(3).trim();

    // Rename form: "R  old -> new" — we care about the new path.
    if (x === "R" || y === "R") {
      const arrow = path.indexOf(" -> ");
      if (arrow !== -1) path = path.slice(arrow + 4).trim();
    }
    // Strip surrounding quotes (git quotes paths with special chars).
    if (path.startsWith('"') && path.endsWith('"')) {
      path = path.slice(1, -1);
    }

    if (ignoredSuffixes.some((s) => path.endsWith(s))) continue;
    if (ignoredFragments.some((f) => path.includes(f))) continue;

    const inWatchedTree = WATCHED_TREE_ROOTS.some((root) => path.startsWith(root));
    if (!inWatchedTree) continue;

    const isUntracked = x === "?" && y === "?";
    const isAdded = x === "A" || y === "A";
    const isDeleted = x === "D" || y === "D";
    const isRenamed = x === "R" || y === "R";

    if (isUntracked || isAdded || isDeleted || isRenamed) {
      return true;
    }
  }
  return false;
}

// ── Main ────────────────────────────────────────────────────────────

function block(reason: string): void {
  console.log(JSON.stringify({ decision: "block", reason }));
}

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input: HookInput = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

  // Only act on Stop events
  if (input.hook_event_name !== "Stop") return;

  const changedFiles = getChangedFiles(input.transcript_path);
  if (changedFiles.length === 0) return;

  // --- Check 0: Run tests ---
  const hasTestChanges = changedFiles.some((f) => f.includes("convex/"));
  if (hasTestChanges) {
    console.error("Running tests...");
    const testResult = await runCommand("bun", ["run", "test"], input.cwd);
    if (testResult.code !== 0) {
      block(`Tests failed. Please fix them:\n${testResult.output}`);
      return;
    }
  }

  // --- Check 1: TypeScript typecheck ---
  console.error("Running TypeScript typecheck...");
  const tsResult = await runCommand("bun", ["run", "typecheck"], input.cwd);
  if (tsResult.code !== 0) {
    block(`TypeScript errors found. Please fix them:\n${tsResult.output}`);
    return;
  }

  // --- Check 2: Convex typecheck (schema vs function signatures) ---
  console.error("Running Convex typecheck...");
  const convexResult = await runCommand(
    "bunx",
    ["convex", "typecheck"],
    input.cwd
  );
  if (convexResult.code !== 0) {
    block(
      `Convex typecheck failed. Please fix the function signature / schema errors:\n${convexResult.output}`
    );
    return;
  }

  // --- Check 3: Unused _generated imports ---
  console.error("Checking for unused _generated imports...");
  const unusedImports = checkUnusedGeneratedImports(input.cwd);
  if (unusedImports.length > 0) {
    block(
      `Unused imports from convex/_generated found. Please remove them:\n${unusedImports.join("\n")}`
    );
    return;
  }

  // --- Check 4: Client-only packages in server code ---
  console.error("Checking for client-only imports in convex/...");
  const clientImports = checkClientImportsInConvex(input.cwd);
  if (clientImports.length > 0) {
    block(
      `Client-only packages imported in server-side Convex code. Please remove them:\n${clientImports.join("\n")}`
    );
    return;
  }

  // --- Check 5: Next.js MCP runtime errors ---
  console.error("Checking Next.js MCP for runtime errors...");
  const mcpErrors = await checkNextJsMcpErrors(input.cwd);
  if (mcpErrors) {
    block(`Next.js runtime errors detected via MCP:\n${mcpErrors}`);
    return;
  }

  // --- All checks passed — content-derived diagram + structural tree updates ---
  const diagramDir = join(input.cwd, DIAGRAM_DIR);
  const diagramsDirExists = existsSync(diagramDir);

  let affected = new Set<string>();
  let unmatched: string[] = [];
  let diagramCount = 0;

  if (diagramsDirExists) {
    const watchMap = scanDiagrams(diagramDir);
    diagramCount = watchMap.diagramFiles.length;
    if (diagramCount > 0) {
      const relPaths = changedFiles.map((f) =>
        f.startsWith(input.cwd) ? f.slice(input.cwd.length + 1) : f
      );
      const result = matchChangedFiles(relPaths, watchMap);
      affected = result.affected;
      unmatched = result.unmatched;
    }
  }

  const updateArchTree = hasStructuralTreeChanges(input.cwd);
  const hasLayer1Work = affected.size > 0;
  const hasLayer2Work = unmatched.length > 0 && diagramCount > 0;
  const hasWork = hasLayer1Work || hasLayer2Work || updateArchTree;

  if (!hasWork) {
    console.error("All checks passed.");
    return;
  }

  if (isDiagramUpdateDebounced()) {
    const parts: string[] = [];
    if (hasLayer1Work) parts.push(`update: ${[...affected].join(", ")}`);
    if (hasLayer2Work) parts.push(`gap-fill: ${unmatched.length} unmatched file(s)`);
    if (updateArchTree) parts.push("CLAUDE.md architecture tree");
    console.error(
      `Updates needed: ${parts.join("; ")}. Skipped — another update ran within ${DEBOUNCE_SECONDS}s.`
    );
    return;
  }

  const parts: string[] = [];
  if (hasLayer1Work) parts.push(`update: ${[...affected].join(", ")}`);
  if (hasLayer2Work) parts.push(`gap-fill: ${unmatched.length} unmatched file(s)`);
  if (updateArchTree) parts.push("CLAUDE.md architecture tree");
  console.error(`Updates needed: ${parts.join("; ")}. Spawning updater...`);

  touchLockFile();

  const prompt = buildUpdaterPrompt({
    changedFiles,
    affected: [...affected],
    unmatched,
    updateArchTree,
    diagramDir: DIAGRAM_DIR,
    diagramDirAbs: diagramDir,
  });

  const child = spawn("claude", ["-p", "--model", "sonnet", prompt], {
    cwd: input.cwd,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

// ── Updater prompt builder ──────────────────────────────────────────

interface UpdaterPromptArgs {
  changedFiles: string[];
  affected: string[];
  unmatched: string[];
  updateArchTree: boolean;
  diagramDir: string;
  diagramDirAbs: string;
}

/**
 * Build the sub-Claude prompt for the diagram/tree updater. Handles any
 * combination of Layer 1 (update affected diagrams), Layer 2 (gap-fill for
 * unmatched in-tree files), and the CLAUDE.md architecture-tree refresh.
 */
function buildUpdaterPrompt(args: UpdaterPromptArgs): string {
  const {
    changedFiles,
    affected,
    unmatched,
    updateArchTree,
    diagramDir,
    diagramDirAbs,
  } = args;

  const segments: string[] = [];

  segments.push(
    `The following source files were changed in the last session: ${changedFiles.join(", ")}.`
  );

  if (affected.length > 0) {
    segments.push(
      `UPDATE these existing mermaid diagrams in ${diagramDir}/: ${affected.join(", ")}. ` +
        `Read each diagram file first, then read the changed source files, and edit only the parts that need updating to reflect the current code. ` +
        `Preserve existing file-path references inside the diagrams — they drive the watch system; do not delete them unless the referenced file was deleted.`
    );
  }

  if (unmatched.length > 0) {
    // Build a lightweight catalog of existing diagrams (name + first 20 lines)
    // so sub-Claude can decide which existing diagram best covers the new files
    // without having to open every file blindly.
    const catalog = listDiagramHeaders(diagramDirAbs);
    segments.push(
      `GAP-FILL: these changed files live in a watched source tree but are NOT referenced by any existing diagram: ${unmatched.join(", ")}. ` +
        `Decide one of: ` +
        `(a) the most appropriate existing diagram in ${diagramDir}/ should cover these files — open it, update it, and embed the file paths inside the diagram body (tables, mermaid node labels, or prose) so future Stop hooks will watch them. ` +
        `(b) a new diagram makes sense (e.g., a new integration, data pipeline, auth provider, or external service) — create it in ${diagramDir}/ with a descriptive filename and include the file paths. ` +
        `(c) these files are genuinely not worth documenting (build config, scratch, one-off migration) — do nothing for those files specifically. ` +
        `Here is the header of each existing diagram (first 20 lines) so you can pick the right one:\n\n${catalog}`
    );
  }

  if (updateArchTree) {
    segments.push(
      `ALSO update the "## Architecture" file-tree code block in CLAUDE.md. ` +
        `Structural changes were detected (files added, deleted, or renamed) in watched directories. ` +
        `Read the current CLAUDE.md tree block, walk the actual file structure under convex/, src/routes/, src/components/, src/lib/, src/hooks/, .claude/hooks/, and update the tree to match reality. ` +
        `Keep the same indented-tree format and inline comments. Only edit the "## Architecture" code block — do not touch any other section of CLAUDE.md.`
    );
  }

  segments.push(
    `Use mermaid syntax inside markdown code blocks. Include tables for quick reference. Prioritize completeness for AI consumption — include every edge case and conditional path.`
  );
  segments.push(
    `Do NOT commit. Leave all updates as unstaged changes in the working tree.`
  );

  return segments.join(" ");
}

/**
 * Read the first 20 lines of each diagram in the directory and return a
 * compact listing used by the Layer 2 gap-fill prompt.
 */
function listDiagramHeaders(diagramDirAbs: string): string {
  let entries;
  try {
    entries = readdirSync(diagramDirAbs, { withFileTypes: true });
  } catch {
    return "(no diagrams found)";
  }

  const chunks: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    try {
      const text = readFileSync(join(diagramDirAbs, entry.name), "utf-8");
      const head = text.split("\n").slice(0, 20).join("\n");
      chunks.push(`── ${entry.name} ──\n${head}`);
    } catch {
      // Skip unreadable diagrams
    }
  }
  return chunks.join("\n\n");
}

main().catch((e) => {
  console.error("Hook error:", e);
  process.exit(0); // Don't block on hook errors
});
