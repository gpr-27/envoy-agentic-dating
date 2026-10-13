import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NormalizedInstagram } from "@/lib/contracts";
import { captureImages } from "@/lib/scrape";

async function png(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } }).png().toBuffer();
}

async function dims(dataUrl: string) {
  const meta = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).metadata();
  return { w: meta.width, h: meta.height, format: meta.format };
}

function ig(posts: Array<{ id: string; imageUrl: string | null }>, profilePicUrl: string | null) {
  return NormalizedInstagram.parse({ handle: "jane.doe", url: "https://www.instagram.com/jane.doe/", profilePicUrl, posts });
}

const saved = process.env.MOCK_EXTERNALS;
beforeEach(() => {
  delete process.env.MOCK_EXTERNALS;
});
afterEach(() => {
  if (saved === undefined) delete process.env.MOCK_EXTERNALS;
  else process.env.MOCK_EXTERNALS = saved;
});

describe("captureImages (SCR-11)", () => {
  it("downsizes valid images, skips 404/garbage/timeouts, stores ≤4 posts plus the avatar", async () => {
    const big = await png(1600, 1200);
    const small = await png(300, 200);
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("404")) return new Response("nope", { status: 404 });
      if (url.includes("garbage")) return new Response("not an image", { status: 200 });
      if (url.includes("hang")) {
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      }
      return new Response(new Uint8Array(url.includes("small") ? small : big), { status: 200, headers: { "content-type": "image/png" } });
    };
    const profile = ig(
      [
        { id: "a", imageUrl: "https://cdn/404.jpg" },
        { id: "b", imageUrl: "https://cdn/big1.jpg" },
        { id: "c", imageUrl: "https://cdn/garbage.jpg" },
        { id: "d", imageUrl: null },
        { id: "e", imageUrl: "https://cdn/small.jpg" },
        { id: "f", imageUrl: "https://cdn/hang.jpg" },
        { id: "g", imageUrl: "https://cdn/big2.jpg" },
        { id: "h", imageUrl: "https://cdn/big3.jpg" },
        { id: "i", imageUrl: "https://cdn/big4.jpg" },
        { id: "j", imageUrl: "https://cdn/big5.jpg" },
      ],
      "https://cdn/avatar.jpg",
    );
    const res = await captureImages(profile, { fetchImpl: fakeFetch, timeoutMs: 200 });
    expect(res.photoDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(await dims(res.photoDataUrl!)).toEqual({ w: 160, h: 160, format: "jpeg" });
    expect(res.images[0].postId).toBe("profile");
    const posts = res.images.filter((i) => i.postId !== "profile");
    expect(posts.map((p) => p.postId)).toEqual(["b", "e", "g", "h"]); // 404, garbage, missing and hung skipped; capped at 4
    for (const p of posts) {
      const d = await dims(p.dataUrl);
      expect(Math.max(d.w ?? 0, d.h ?? 0)).toBeLessThanOrEqual(512);
    }
    expect(await dims(posts[1].dataUrl)).toMatchObject({ w: 300, h: 200 }); // never enlarged
    expect(await dims(posts[0].dataUrl)).toMatchObject({ w: 512, h: 384 });
  });

  it("never throws, even when fetch itself throws", async () => {
    const boom: typeof fetch = async () => {
      throw new Error("network down");
    };
    const res = await captureImages(ig([{ id: "x", imageUrl: "https://cdn/x.jpg" }], "https://cdn/p.jpg"), { fetchImpl: boom });
    expect(res).toEqual({ images: [], photoDataUrl: null });
  });
});
