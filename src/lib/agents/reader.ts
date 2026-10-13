/**
 * The Reader agent: reads one person's LinkedIn + Instagram (two calls:
 * read → synthesize) and produces the profile the person's agent dates with.
 */
import { ProfileAnalysis, ReadingLog, type ScrapeBundle } from "@/lib/contracts";
import { complete } from "@/lib/llm/router";
import { pickImages } from "./format";
import { postprocessAnalysis, postprocessReadingLog } from "./postprocess";
import { readerSystem, readerUser } from "./prompts/reader";
import { synthesisSystem, synthesisUser } from "./prompts/synthesis";

/**
 * Read pass: a first-person reading log (6-10 evidence-backed steps) and a
 * first impression. Up to 4 captured images go inline to vision models.
 */
export async function readPerson(bundle: ScrapeBundle): Promise<{ readingLog: ReadingLog; model: string }> {
  const { dataUrls, labels } = pickImages(bundle);
  const res = await complete({
    task: "read",
    system: readerSystem(),
    user: readerUser(bundle, labels),
    schema: ReadingLog,
    images: dataUrls,
  });
  return { readingLog: postprocessReadingLog(res.data, bundle), model: res.model };
}

/**
 * Synthesis pass: the full ProfileAnalysis (needs, hobbies, interests, other
 * qualities, flags, hooks, identity check, confidence), every trait backed
 * by LinkedIn/Instagram evidence.
 */
export async function synthesizeProfile(bundle: ScrapeBundle, readingLog: ReadingLog): Promise<{ analysis: ProfileAnalysis; model: string }> {
  const res = await complete({
    task: "synthesize",
    system: synthesisSystem(),
    user: synthesisUser(bundle, readingLog),
    schema: ProfileAnalysis,
  });
  return { analysis: postprocessAnalysis(res.data, bundle), model: res.model };
}
