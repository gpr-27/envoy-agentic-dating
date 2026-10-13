/**
 * Convert zod schemas into the simple JSON-schema subset that Gemini
 * structured output accepts, plus a compact TypeScript-like "shape hint"
 * for providers that only take the schema in the prompt (Groq).
 */
import { z } from "zod";

type Json = { [k: string]: unknown };

const KEEP = new Set(["type", "properties", "required", "items", "enum", "description", "propertyOrdering"]);

function simplifyNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplifyNode);
  if (!node || typeof node !== "object") return node;
  const src = node as Json;

  // anyOf/oneOf [X, null] → X
  const union = (src.anyOf ?? src.oneOf) as unknown[] | undefined;
  if (Array.isArray(union)) {
    const nonNull = union.filter((u) => !(u && typeof u === "object" && (u as Json).type === "null"));
    return simplifyNode(nonNull[0] ?? { type: "string" });
  }

  const out: Json = {};
  for (const [k, v] of Object.entries(src)) {
    if (!KEEP.has(k)) continue;
    if (k === "type" && Array.isArray(v)) {
      const t = v.filter((x) => x !== "null");
      out.type = t[0] ?? "string";
    } else if (k === "properties" && v && typeof v === "object") {
      const props: Json = {};
      for (const [pk, pv] of Object.entries(v as Json)) props[pk] = simplifyNode(pv);
      out.properties = props;
    } else if (k === "items") {
      out.items = simplifyNode(v);
    } else {
      out[k] = v;
    }
  }
  if (out.properties && !out.propertyOrdering) out.propertyOrdering = Object.keys(out.properties as Json);
  return out;
}

/** Simplified JSON schema for a zod schema (no $schema, additionalProperties, defaults, min/max). */
export function toProviderJsonSchema(schema: z.ZodType): object {
  const raw = z.toJSONSchema(schema, { unrepresentable: "any" }) as Json;
  return simplifyNode(raw) as object;
}

/** Compact TS-like shape: `{ chemistry: number; clicked: string[] }`. */
export function shapeHint(jsonSchema: object): string {
  const render = (node: unknown, depth: number): string => {
    if (!node || typeof node !== "object" || depth > 8) return "any";
    const n = node as Json;
    if (Array.isArray(n.enum)) return (n.enum as unknown[]).map((e) => JSON.stringify(e)).join(" | ");
    switch (n.type) {
      case "object": {
        const props = (n.properties ?? {}) as Json;
        const req = new Set((n.required as string[] | undefined) ?? []);
        const body = Object.entries(props)
          .map(([k, v]) => `${k}${req.has(k) ? "" : "?"}: ${render(v, depth + 1)}`)
          .join("; ");
        return `{ ${body} }`;
      }
      case "array":
        return `Array<${render(n.items, depth + 1)}>`;
      case "integer":
        return "integer";
      case "number":
      case "string":
      case "boolean":
        return n.type;
      default:
        return "any";
    }
  };
  return render(jsonSchema, 0);
}
