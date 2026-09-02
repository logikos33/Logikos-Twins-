import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createProject, listProjects } from "@/lib/services/projects";

export const dynamic = "force-dynamic";

async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return jar.get("admin_token")?.value === env().ADMIN_TOKEN;
}

export async function GET() {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const projects = await listProjects();
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      captureToken: p.captureToken,
      createdAt: p.createdAt.toISOString(),
      revoked: p.revokedAt != null,
    })),
  });
}

const bodySchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function POST(req: NextRequest) {
  if (!(await isAdmin()))
    return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const p = await createProject(parsed.data.name);
  return NextResponse.json(
    { id: p.id, name: p.name, captureToken: p.captureToken },
    { status: 201 },
  );
}
