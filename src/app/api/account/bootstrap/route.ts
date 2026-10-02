import { NextResponse } from "next/server";
import {
  computeMergeCase,
  upsertBootstrapIdentity,
  type MergeCase,
} from "@/lib/account/bootstrap";
import { ERROR_CODES, jsonError } from "@/lib/api-error";
import { requireAccess } from "@/lib/auth/require-access";
import {
  resolveAppleProviderSubject,
  subjectPrefix,
} from "@/lib/auth/verify-access-token";
import { log } from "@/lib/log";
import { getRequestId, REQUEST_ID_HEADER } from "@/lib/request-id";
import { userHasJourneyCase } from "@/lib/journey/case";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BootstrapBody = {
  hasLocalDraft?: boolean;
};

type MergePayload = {
  case: MergeCase;
  hasLocalDraft: boolean;
  hasServerJourney: boolean;
};

type BootstrapSuccess = {
  userId: string;
  created: boolean;
  merge: MergePayload;
};

function withRequestId<T>(
  body: T,
  status: number,
  requestId: string,
): NextResponse<T> {
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  return res;
}

/**
 * POST /api/account/bootstrap (F2.3 / F2.1 §5 / §10; F2.5 uses requireAccess)
 * Bearer JWT → idempotent ensure internal.users + Apple auth_identities.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const logger = log.child({ requestId });

  // --- parse body (empty OK → hasLocalDraft false) ---
  let hasLocalDraft = false;
  const raw = await request.text();
  if (raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw) as BootstrapBody;
      if (
        parsed.hasLocalDraft !== undefined &&
        typeof parsed.hasLocalDraft !== "boolean"
      ) {
        return jsonError({
          code: ERROR_CODES.BAD_REQUEST,
          message: "hasLocalDraft must be a boolean",
          requestId,
          status: 400,
        });
      }
      hasLocalDraft = parsed.hasLocalDraft === true;
    } catch {
      return jsonError({
        code: ERROR_CODES.BAD_REQUEST,
        message: "Malformed JSON body",
        requestId,
        status: 400,
      });
    }
  }

  // --- verify JWT via shared helper (env-scoped getUser) ---
  const auth = await requireAccess(request, {
    requestId,
    logger,
    failMessage: "bootstrap unauthenticated",
  });
  if (auth instanceof NextResponse) return auth;

  const { user, userId } = auth;
  const providerSubject = resolveAppleProviderSubject(user);
  if (!providerSubject) {
    // Prefer UNAUTHENTICATED when no usable Apple binding (F2.3 runbook).
    logger.info("bootstrap no apple identity", {
      code: ERROR_CODES.UNAUTHENTICATED,
      userId,
    });
    return jsonError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "No Apple identity bound to this session",
      requestId,
      status: 401,
    });
  }

  // --- service_role upsert + F4 journey existence ---
  let upsert;
  let hasServerJourney = false;
  try {
    const service = createServiceClient();
    upsert = await upsertBootstrapIdentity(service, {
      userId,
      email: user.email ?? null,
      providerSubject,
    });
    if (upsert.ok) {
      const journeyCheck = await userHasJourneyCase(service, upsert.userId);
      if (!journeyCheck.ok) {
        logger.error("bootstrap journey check failed", {
          code: ERROR_CODES.INTERNAL_ERROR,
          userId,
        });
        return jsonError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "Bootstrap failed",
          requestId,
          status: 500,
        });
      }
      hasServerJourney = journeyCheck.hasServerJourney;
    }
  } catch {
    logger.error("bootstrap upsert threw", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected bootstrap failure",
      requestId,
      status: 500,
    });
  }

  if (!upsert.ok) {
    if (upsert.code === "ACCOUNT_PENDING_DELETION") {
      logger.info("bootstrap pending deletion", {
        code: ERROR_CODES.ACCOUNT_PENDING_DELETION,
        userId,
      });
      return jsonError({
        code: ERROR_CODES.ACCOUNT_PENDING_DELETION,
        message: upsert.message,
        requestId,
        status: 403,
      });
    }
    if (upsert.code === "ACCOUNT_DELETED") {
      logger.info("bootstrap account deleted", {
        code: ERROR_CODES.ACCOUNT_DELETED,
        userId,
        subjectPrefix: subjectPrefix(providerSubject),
      });
      return jsonError({
        code: ERROR_CODES.ACCOUNT_DELETED,
        message: upsert.message,
        requestId,
        status: 410,
      });
    }
    logger.error("bootstrap upsert failed", {
      code: ERROR_CODES.INTERNAL_ERROR,
      userId,
      upsertCode: upsert.code,
    });
    return jsonError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Bootstrap failed",
      requestId,
      status: 500,
    });
  }

  const mergeCase = computeMergeCase({
    hasLocalDraft,
    hasServerJourney,
    identityAlreadyLinked: upsert.identityAlreadyLinked,
  });

  const merge: MergePayload = {
    case: mergeCase,
    hasLocalDraft,
    hasServerJourney,
  };

  const body: BootstrapSuccess = {
    userId: upsert.userId,
    created: upsert.created,
    merge,
  };

  if (mergeCase === "B") {
    // Case B: still return userId; client must not sync upload until choice (F2.1).
    logger.info("bootstrap merge required", {
      code: ERROR_CODES.MERGE_REQUIRED,
      userId: upsert.userId,
      created: upsert.created,
    });
    const conflict = {
      ...body,
      error: {
        code: ERROR_CODES.MERGE_REQUIRED,
        message: "Local draft and server journey both present; choose Keep server or Replace with local",
        requestId,
      },
    };
    return withRequestId(conflict, 409, requestId);
  }

  logger.info("bootstrap ok", {
    userId: upsert.userId,
    created: upsert.created,
    mergeCase,
  });
  return withRequestId(body, 200, requestId);
}
