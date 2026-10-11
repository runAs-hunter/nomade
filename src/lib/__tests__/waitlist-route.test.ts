import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WAITLIST_COPY } from "@/lib/waitlist/copy";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
const schemaMock = vi.fn(() => ({ from: fromMock }));
const createServiceClientMock = vi.fn(() => ({
  schema: schemaMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => createServiceClientMock(),
}));

import { POST } from "@/app/api/waitlist/route";
import { resetServerEnvCache } from "@/lib/env";

const DEV_URL = "https://bgdrzdlenmwbpalnjiqg.supabase.co";
const PROD_URL = "https://whjzynfsifrtrxlylrww.supabase.co";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: DEV_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
};

const NO_ATTRIBUTION = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_content: null,
  referrer_host: null,
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("waitlist copy", () => {
  it("locks the homepage strings", () => {
    expect(WAITLIST_COPY.headline).toBe("See the path for Italy’s digital nomad visa.");
    expect(WAITLIST_COPY.subhead).toBe(
      "Nomade is a guided checklist for Americans. It shows the steps on the digital nomad path and which U.S. consulate post to use, framed from official sources.",
    );
    expect(WAITLIST_COPY.whatYouGetLabel).toBe("What you get:");
    expect(WAITLIST_COPY.benefits).toEqual([
      "A path checklist for Italy’s digital nomad visa",
      "Which U.S. consulate post handles your application",
      "Official-source framing, so you can check the source yourself",
    ]);
    expect(WAITLIST_COPY.remoteWorker).toBe(
      "Remote worker is a related path, not the headline.",
    );
    expect(WAITLIST_COPY.emailLabel).toBe("Email");
    expect(WAITLIST_COPY.button).toBe("Join the waitlist");
    expect(WAITLIST_COPY.microcopy).toBe(
      "We’ll email you when there’s something new. No spam.",
    );
    expect(WAITLIST_COPY.disclaimer).toBe(
      "Nomade is preliminary guidance, not a law firm and not legal advice. It does not guarantee a visa. Consulate practice and official requirements can change. Always confirm with the official source before you file.",
    );
    expect(WAITLIST_COPY.success).toBe("You’re on the waitlist.");
    expect(WAITLIST_COPY.failure).toBe("Couldn’t save that email. Try again.");
  });

  it("homepage does not link the quiz or the removed claims", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );
    expect(page).not.toMatch(/\/quiz/);
    expect(page).not.toMatch(/Available now/);
    expect(page).not.toMatch(/Portugal/);
    expect(page).not.toMatch(/Spain/);
    expect(page).not.toMatch(/€/);
    expect(page).not.toMatch(/28,?000/);
    expect(page).not.toMatch(/answer 5 questions/i);
  });
});

describe("POST /api/waitlist", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    insertMock.mockReset();
    fromMock.mockClear();
    schemaMock.mockClear();
    createServiceClientMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = VALID.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it("rejects an invalid email and does not insert", async () => {
    const cases = [
      {},
      { email: "" },
      { email: "   " },
      { email: "not-an-email" },
      { email: "a@b" },
      { email: "user@example.com".padStart(255, "a") },
    ];
    for (const body of cases) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({ ok: false, message: WAITLIST_COPY.failure });
      expect(JSON.stringify(json)).not.toContain(WAITLIST_COPY.success);
    }
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not look like success when insert fails", async () => {
    insertMock.mockResolvedValue({
      error: { code: "42501", message: "permission denied secret-should-not-leak" },
    });
    const res = await POST(post({ email: "ada@example.com" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.ok).toBe(false);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe(WAITLIST_COPY.failure);
    expect(JSON.stringify(json)).not.toContain(WAITLIST_COPY.success);
    expect(JSON.stringify(json)).not.toContain("secret-should-not-leak");
    expect(JSON.stringify(json)).not.toContain("permission denied");
  });

  it("treats a unique conflict as success", async () => {
    insertMock.mockResolvedValue({
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const res = await POST(post({ email: "ada@example.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, message: WAITLIST_COPY.success });
    expect(JSON.stringify(json)).not.toContain(WAITLIST_COPY.failure);
  });

  it("refuses the nomade-prod project ref and does not write", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_URL;
    const res = await POST(post({ email: "Ada@Example.com" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.message).toBe(WAITLIST_COPY.failure);
    expect(JSON.stringify(json)).not.toContain(WAITLIST_COPY.success);
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts the normalized email on the happy path", async () => {
    const res = await POST(post({ email: "  Ada@Example.COM  " }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, message: WAITLIST_COPY.success });
    expect(createServiceClientMock).toHaveBeenCalledTimes(1);
    expect(schemaMock).toHaveBeenCalledWith("internal");
    expect(fromMock).toHaveBeenCalledWith("waitlist_signups");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      ...NO_ATTRIBUTION,
    });
  });
});

describe("POST /api/waitlist attribution", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    resetServerEnvCache();
    insertMock.mockReset();
    createServiceClientMock.mockClear();
    insertMock.mockResolvedValue({ error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = VALID.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = VALID.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    resetServerEnvCache();
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  async function expectSuccess(res: Response) {
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, message: WAITLIST_COPY.success });
  }

  it("stores UTMs and the referrer host (trimmed + lowercased)", async () => {
    const res = await POST(
      post({
        email: "ada@example.com",
        utm_source: "  Reddit ",
        utm_medium: "social",
        utm_campaign: "Italy_DNV-2026.10",
        utm_content: "post-1",
        referrer_host: "www.Reddit.com",
      }),
    );
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      utm_source: "reddit",
      utm_medium: "social",
      utm_campaign: "italy_dnv-2026.10",
      utm_content: "post-1",
      referrer_host: "www.reddit.com",
    });
  });

  it("still works without any UTMs", async () => {
    const res = await POST(post({ email: "ada@example.com" }));
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      ...NO_ATTRIBUTION,
    });
  });

  it("drops junk attribution and the signup still succeeds", async () => {
    const res = await POST(
      post({
        email: "ada@example.com",
        utm_source: "bad source!<script>",
        utm_medium: "x".repeat(101),
        utm_campaign: 12345,
        utm_content: { nested: "object" },
        referrer_host: "https://evil.example.com/path?q=1",
      }),
    );
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      ...NO_ATTRIBUTION,
    });
  });

  it("drops other wrong types (arrays, booleans, null, empty) without failing", async () => {
    const res = await POST(
      post({
        email: "ada@example.com",
        utm_source: ["reddit"],
        utm_medium: true,
        utm_campaign: null,
        utm_content: "   ",
        referrer_host: "",
      }),
    );
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      ...NO_ATTRIBUTION,
    });
  });

  it("keeps valid fields while dropping invalid ones; accepts exactly 100 chars", async () => {
    const res = await POST(
      post({
        email: "ada@example.com",
        utm_source: "a".repeat(100),
        utm_medium: "a".repeat(101),
      }),
    );
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledWith({
      ...NO_ATTRIBUTION,
      email: "ada@example.com",
      utm_source: "a".repeat(100),
    });
  });

  it("drops the referrer host when it is the site's own host", async () => {
    const res = await POST(
      post(
        { email: "ada@example.com", referrer_host: "www.nomade-eight.vercel.app" },
        { host: "nomade-eight.vercel.app" },
      ),
    );
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      ...NO_ATTRIBUTION,
    });

    insertMock.mockClear();
    await expectSuccess(
      await POST(post({ email: "ada@example.com", referrer_host: "localhost" })),
    );
    expect(insertMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      ...NO_ATTRIBUTION,
    });
  });

  it("an invalid email is still rejected even with valid UTMs", async () => {
    const res = await POST(post({ email: "nope", utm_source: "reddit" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("retries with the email only if the attributed insert is refused", async () => {
    insertMock
      .mockResolvedValueOnce({ error: { code: "42703", message: "column does not exist" } })
      .mockResolvedValueOnce({ error: null });
    const res = await POST(post({ email: "ada@example.com", utm_source: "reddit" }));
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock).toHaveBeenLastCalledWith({ email: "ada@example.com" });
  });

  it("does not retry on a duplicate email (still success)", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });
    const res = await POST(post({ email: "ada@example.com", utm_source: "reddit" }));
    await expectSuccess(res);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
