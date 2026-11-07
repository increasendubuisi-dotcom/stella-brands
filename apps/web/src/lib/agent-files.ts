import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { snapshotToAgentJson, snapshotToMarkdown, type AgentExportMeta, type GuideSnapshot } from "@stella/brand-schema";
import { loadPublishedGuide } from "@/lib/guide";

/**
 * brand.md and brand.json: the published guide for AI tools. Same access rules
 * as the human guide (a password-protected guide needs the unlock cookie), and
 * built only from the live snapshot, never the draft.
 */
export async function agentFile(req: NextRequest, slug: string, render: (s: GuideSnapshot, meta: AgentExportMeta) => string, contentType: string) {
  const guide = await loadPublishedGuide(slug);
  if (guide.kind !== "ok") return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const meta: AgentExportMeta = {
    version: guide.version,
    publishedAt: guide.publishedAt,
    guideUrl: `${req.nextUrl.origin}/g/${slug}`,
  };
  return new NextResponse(render(guide.snapshot, meta), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Private: password-protected guides must not land in shared caches.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export const renderMarkdown = snapshotToMarkdown;
export const renderJson = (s: GuideSnapshot, meta: AgentExportMeta) => JSON.stringify(snapshotToAgentJson(s, meta), null, 2);
