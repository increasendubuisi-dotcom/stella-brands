import type { NextRequest } from "next/server";
import { agentFile, renderMarkdown } from "@/lib/agent-files";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return agentFile(req, slug, renderMarkdown, "text/markdown; charset=utf-8");
}
