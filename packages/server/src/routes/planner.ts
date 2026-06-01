import { newId } from "@myra/shared";

import { resolveDataDir } from "../store/file-store";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/** Maximum time we wait for `opencode run` to produce the JSON plan. */
const PLAN_TIMEOUT_MS = 180_000;
const POLL_MS = 250;

/** One task the planner decomposed an objective into. */
export interface PlannedTask {
  title: string;
  description: string;
  agentPrompt: string;
  tags: string[];
}

interface PlannerOutput {
  tasks: PlannedTask[];
}

function buildPlannerPrompt(objectives: string, resultPath: string): string {
  return `## Rôle
Tu es un organiseur de journée pour un développeur. Tu transformes une liste
d'objectifs en langage libre en une liste de tâches atomiques, concrètes et
indépendantes. Chaque tâche doit pouvoir être exécutée seule par un agent
codeur (l'agent opencode lui-même).

## Objectifs de l'utilisateur
${objectives}

## Consignes de découpage
- Vise entre 3 et 10 tâches selon la densité des objectifs.
- Une tâche = un livrable clair, pas une journée entière.
- Pas de tâches d'organisation/méta (genre « planifier la journée »).
- Garde l'ordre logique : si B dépend de A, A vient en premier.
- Les titres sont à l'impératif, courts (max 60 caractères).
- La description donne le contexte en 1 à 3 phrases.
- L'agentPrompt est une instruction complète et autonome — comme si tu
  écrivais directement à un agent qui n'a pas vu les objectifs initiaux.
- Les tags sont 1 à 3 mots-clés courts, en minuscules, sans #.

## Format de sortie OBLIGATOIRE
Écris UNIQUEMENT un fichier JSON à ce chemin exact :
  ${resultPath}

Structure attendue :
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "agentPrompt": "...",
      "tags": ["..."]
    }
  ]
}

N'écris RIEN d'autre. Pas de markdown, pas d'explication, pas de message dans
le terminal. Juste le fichier. Après l'avoir écrit, tu peux quitter.
`;
}

/** Find the first balanced `{...}` substring — a safety net for fenced JSON. */
function extractJsonBlock(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

async function parseResultFile(path: string): Promise<PlannedTask[]> {
  const raw = await readFile(path, "utf8");
  const cleaned = extractJsonBlock(raw) ?? raw;
  let parsed: PlannerOutput;
  try {
    parsed = JSON.parse(cleaned) as PlannerOutput;
  } catch (err) {
    const preview = cleaned.slice(0, 300);
    throw new Error(`Réponse de l'agent illisible (JSON invalide : ${err}).\nDébut du contenu :\n${preview}`);
  }
  return (parsed.tasks ?? []).filter((t) => t.title?.trim());
}

function runPlanner(prompt: string, cwd: string, resultPath: string): Promise<PlannedTask[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("opencode", ["run", "--dangerously-skip-permissions", "--", prompt], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    let settled = false;
    let exited = false;
    let exitCode: number | null = null;
    const start = Date.now();

    const finishOk = async () => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      try {
        child.kill();
      } catch {
        // already gone
      }
      try {
        resolve(await parseResultFile(resultPath));
      } catch (err) {
        reject(err);
      }
    };

    const finishErr = (message: string) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      try {
        child.kill();
      } catch {
        // already gone
      }
      reject(new Error(message));
    };

    child.on("error", () => finishErr("Impossible de lancer `opencode` (vérifie qu'il est installé et dans le PATH)."));
    child.on("close", (code) => {
      exited = true;
      exitCode = code;
    });

    const timer = setInterval(() => {
      if (existsSync(resultPath)) {
        void finishOk();
        return;
      }
      if (exited) {
        finishErr(
          `L'agent s'est terminé (code ${exitCode ?? -1}) sans écrire de plan.\nStderr :\n${stderr.slice(0, 800)}`,
        );
        return;
      }
      if (Date.now() - start >= PLAN_TIMEOUT_MS) {
        finishErr(`L'agent a dépassé ${PLAN_TIMEOUT_MS / 1000}s sans produire de plan.`);
      }
    }, POLL_MS);
  });
}

/**
 * One-shot planner: runs `opencode` to decompose free-text objectives into a
 * list of concrete kanban tasks. Port of `commands/planner.rs::plan_day`.
 */
export async function planDay(objectives: string, workingDir?: string): Promise<PlannedTask[]> {
  const trimmed = objectives.trim();
  if (!trimmed) throw new Error("Aucun objectif fourni.");

  const sessionsDir = join(resolveDataDir(), "plan-sessions");
  await mkdir(sessionsDir, { recursive: true });
  const resultPath = join(sessionsDir, `${newId()}.json`);
  const resultPathStr = resultPath.replaceAll("\\", "/");

  const cwd = workingDir?.trim() || process.cwd();
  if (!existsSync(cwd)) throw new Error(`Le dossier de travail n'existe pas: ${cwd}`);

  const prompt = buildPlannerPrompt(trimmed, resultPathStr);
  try {
    return await runPlanner(prompt, cwd, resultPath);
  } finally {
    await rm(resultPath, { force: true });
  }
}
