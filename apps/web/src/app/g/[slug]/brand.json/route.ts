import type { NextRequest } from "next/server";
import { agentFile, renderJson } from "@/lib/agent-files";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return agentFile(req, slug, renderJson, "application/json; charset=utf-8");
}
