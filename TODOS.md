# TODOS

## T-001: Quarterly Data Review Process
**What:** Create `REVIEW.md` — a checklist for the quarterly Italy data review.
**Why:** Without a documented process, the quarterly review will never happen and `last_verified` will go stale, causing the AI to surface freshness warnings or (worse) serve outdated requirements silently.
**Pros:** Zero chance of forgetting; future reviewers don't have to figure it out from scratch.
**Cons:** One more doc to maintain.
**Context:** The plan specifies quarterly manual review against official Italian sources. The review should check: Ministero degli Affari Esteri requirements, consulate processing times, income thresholds, and accommodation requirements. After review, update `last_verified` in italy.yaml and commit. The REVIEW.md should include the exact sources (URLs), which fields to verify, and how to flag changes.
**Depends on:** italy.yaml must exist (built during scaffolding).
**Owner:** Isaiah | **Cadence:** Quarterly

---

## T-002: Verify Dependent Income Figures
**What:** Verify €8,400/yr per dependent and €2,800/yr per child additional income requirements.
**Why:** These numbers appear on the checklist and users will trust them to determine whether they qualify. An incorrect figure could cause a user to apply with insufficient income and get rejected.
**Pros:** Ensures the most trust-critical numbers are defensible.
**Cons:** Requires reading Italian government sources; may require translation.
**Context:** Figures appear in the italy.yaml `dependent-permesso` task conditions. Source them from Ministero degli Affari Esteri / INPS guidance on family reunification income thresholds for digital nomad visa applicants. Link to primary sources in the YAML `sources` field.
**Depends on:** Nothing — can be done before any code is written.
**Blocking:** Yes — these numbers must be verified before launch.
**Owner:** Isaiah

---

## T-003: User Accounts (Cross-Device Persistence)
**What:** Implement email/OAuth user accounts with server-side persistence of quiz profile and completed tasks.
**Why:** localStorage is single-device only. Users doing a multi-month visa process across multiple devices (phone + laptop) will lose progress. The URL export is a bridge but not a long-term solution.
**Pros:** Cross-device sync, deadline push notifications, progress sharing, future paid tier hook.
**Cons:** Significant engineering effort; authentication complexity; privacy/data considerations.
**Context:** At launch, use localStorage + URL export. The browser warning ("progress is saved in this browser only") should include "Create an account to save across devices →" once accounts exist. Don't build accounts until 50+ real users are actively using the checklist — validate demand first.
**Depends on:** Core checklist working well (Phase 1 complete). URL export (Issue #5) serves as bridge.
**Owner:** TBD | **When:** After validating with real users
