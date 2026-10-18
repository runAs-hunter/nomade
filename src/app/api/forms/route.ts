import type { NextResponse } from "next/server";
import { handleFormsList } from "@/lib/forms/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/forms (F12a). Bearer + active + FORMS_ENABLED. See docs/forms.md. */
export async function GET(request: Request): Promise<NextResponse> {
  return handleFormsList(request);
}
