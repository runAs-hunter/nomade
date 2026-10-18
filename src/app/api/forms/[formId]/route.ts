import type { NextResponse } from "next/server";
import { handleFormGet } from "@/lib/forms/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/forms/:formId (F12a). Bearer + active + FORMS_ENABLED. See docs/forms.md. */
export async function GET(
  request: Request,
  context: { params: Promise<{ formId: string }> },
): Promise<NextResponse> {
  const { formId } = await context.params;
  return handleFormGet(request, formId);
}
