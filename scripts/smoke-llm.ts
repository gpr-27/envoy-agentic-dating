/**
 * LLM smoke test: `npx tsx scripts/smoke-llm.ts [--date]`
 * - loads .env.local (simple parser; never prints secrets)
 * - lists Gemini models available to the key
 * - sends a tiny JSON request to every model in the configured chains and
 *   prints latency, result and rate-limit info
 * - with --date: runs the real router once per task class on a tiny prompt
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function loadEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().replace(/^export\s+/, "");
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = val;
  }
}

async function main(): Promise<void> {
  loadEnv(resolve(process.cwd(), ".env.local"));
  loadEnv(resolve(process.cwd(), ".env"));
  if (process.env.MOCK_EXTERNALS === "1") console.log("note: MOCK_EXTERNALS=1 is set; this smoke test calls real providers anyway.\n");

  const { getChain } = await import("../src/lib/llm/config");
  const { geminiClient, geminiProvider } = await import("../src/lib/llm/providers/gemini");
  const { groqProvider } = await import("../src/lib/llm/providers/groq");
  const { toProviderJsonSchema, shapeHint } = await import("../src/lib/llm/jsonschema");
  const { parseJsonLoose } = await import("../src/lib/llm/json");
  const { ProviderError } = await import("../src/lib/llm/errors");

  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasGroq = Boolean(process.env.GROQ_API_KEY?.trim());
  console.log(`GEMINI_API_KEY: ${hasGemini ? "set" : "MISSING"} | GROQ_API_KEY: ${hasGroq ? "set" : "MISSING"}`);
  if (!hasGemini && !hasGroq) {
    console.log("\nNo provider keys found. Add GEMINI_API_KEY (https://aistudio.google.com/apikey) and/or GROQ_API_KEY (https://console.groq.com/keys) to .env.local.");
    return;
  }

  const prev = process.env.MOCK_EXTERNALS;
  process.env.MOCK_EXTERNALS = "0";
  const chains = { analysis: getChain("analysis"), date: getChain("date"), debrief: getChain("debrief") };
  console.log("\nChains:");
  for (const [k, v] of Object.entries(chains)) console.log(`  ${k}: ${v.map((m) => `${m.provider}:${m.model}`).join(" → ")}`);

  if (hasGemini) {
    try {
      const ai = geminiClient()!;
      const pager = await ai.models.list({ config: { pageSize: 100 } });
      const names: string[] = [];
      for await (const m of pager) {
        if (m.name && /gemini|gemma/.test(m.name) && (m.supportedActions ?? []).includes("generateContent")) names.push(m.name.replace(/^models\//, ""));
      }
      console.log(`\nGemini models with generateContent (${names.length}): ${names.join(", ")}`);
    } catch (e) {
      console.log(`\nGemini models.list failed: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  const Schema = z.object({ ok: z.boolean(), word: z.string() });
  const jsonSchema = toProviderJsonSchema(Schema);
  const unique = new Map<string, { provider: "gemini" | "gemini2" | "groq" | "groq2" | "github" | "mock"; model: string }>();
  for (const list of Object.values(chains)) for (const m of list) unique.set(`${m.provider}:${m.model}`, m);

  console.log("\nPer-model check (tiny JSON request):");
  for (const [id, spec] of unique) {
    const provider = spec.provider === "gemini" ? geminiProvider : spec.provider === "groq" ? groqProvider : null;
    if (!provider || !provider.isAvailable()) {
      console.log(`  ${id.padEnd(42)} skipped (no key)`);
      continue;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    const t0 = Date.now();
    try {
      const res = await provider.generate({
        task: "turn",
        model: spec.model,
        system: "You are a JSON API. Reply with JSON only.",
        user: 'Return {"ok": true, "word": "<one cheerful word>"}.',
        images: [],
        jsonSchema,
        schemaHint: shapeHint(jsonSchema),
        temperature: 0.2,
        maxOutputTokens: 60,
        signal: ctrl.signal,
      });
      const ms = Date.now() - t0;
      const parsed = Schema.safeParse(parseJsonLoose(res.text));
      const rl = res.rateLimit
        ? Object.entries(res.rateLimit)
            .filter(([k]) => /remaining|limit-|reset/.test(k))
            .map(([k, v]) => `${k.replace("x-ratelimit-", "")}=${v}`)
            .join(" ")
        : "";
      console.log(`  ${id.padEnd(42)} ${parsed.success ? "OK " : "BAD"} ${String(ms).padStart(6)}ms  tokens=${res.totalTokens ?? "?"} ${parsed.success ? JSON.stringify(parsed.data) : res.text.slice(0, 80)} ${rl}`);
    } catch (e) {
      const ms = Date.now() - t0;
      const pe = e instanceof ProviderError ? `${e.kind}${e.status ? ` ${e.status}` : ""}${e.retryAfterSec ? ` retry-after ${e.retryAfterSec}s` : ""}` : "error";
      console.log(`  ${id.padEnd(42)} ERR ${String(ms).padStart(6)}ms  ${pe}: ${(e as Error).message.replace(/\s+/g, " ").slice(0, 160)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (process.argv.includes("--date")) {
    const { complete } = await import("../src/lib/llm/router");
    console.log("\nRouter check (one call per chain):");
    for (const task of ["synthesize", "turn", "debrief"] as const) {
      const t0 = Date.now();
      try {
        const r = await complete({ task, system: "Reply with JSON only.", user: 'Return {"ok": true, "word": "hello"}.', schema: Schema, maxOutputTokens: 60 });
        console.log(`  ${task.padEnd(12)} → ${r.provider}:${r.model} in ${Date.now() - t0}ms`);
      } catch (e) {
        console.log(`  ${task.padEnd(12)} → FAILED ${(e as Error).name}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
  }
  if (prev === undefined) delete process.env.MOCK_EXTERNALS;
  else process.env.MOCK_EXTERNALS = prev;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
