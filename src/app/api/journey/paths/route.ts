import { NextResponse } from "next/server";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import { requireActiveJourneyAccount } from "@/lib/journey/access";
import { listJourneyPaths } from "@/lib/journey/catalog";
import { listUsConsulatePosts } from "@/lib/journey/consulates";
import {
  activeAccountErrorResponse,
  withRequestId,
} from "@/lib/journey/http";
import { log } from "@/lib/log";
import { getRequestId } from "@/lib/request-id";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/journey/paths (F3)
 * Bearer + active account. Returns static path picker list.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "journey paths unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  try {
    const service = createServiceClient();
    const account = await requireActiveJourneyAccount(service, auth.userId);
    if (!account.ok) {
      logger.info("journey paths account refused", {
        code: account.code,
        userId: auth.userId,
      });
      return activeAccountErrorResponse(account, requestId);
    }

    const paths = listJourneyPaths();
    const usConsulatePosts = listUsConsulatePosts();
    logger.info("journey paths ok", {
      userId: auth.userId,
      pathCount: paths.length,
      consulatePostCount: usConsulatePosts.length,
    });
    return withRequestId(
      { paths, usConsulatePosts, requestId },
      200,
      requestId,
    );
  } catch {
    logger.error("journey paths threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId: auth.userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected journey paths failure",
      requestId,
      status: 500,
    });
  }
}
