# Nomade v1 - agent handoff

Written 2026-08-19. Every fact below was re-verified against disk, git, `gh`, and
the Xcode archive metadata on that date unless marked otherwise. Read this whole
file before touching either repo.

You are picking up a two-repo product mid-launch. The code is done and deployed.
The remaining v1 work is (a) one click in Apple's web UI that nobody has confirmed
yet, and (b) three backend issues, one of which gates public launch.

---

## 1. What Nomade is

An Italy Digital Nomad Visa assistant. A 5-step quiz builds a `UserProfile`, a
deterministic engine personalizes a phase-by-phase visa checklist from country
data, and an AI chat answers freeform questions with the profile in context.

Two repos, one product:

| Repo | Path | Role | Remote |
|---|---|---|---|
| `nomadeapp` | `/Users/isaiashunter/code/nomadeapp` | Next.js 16 web app **and** the API backend for iOS | `runAs-hunter/nomade` |
| `nomade-ios` | `/Users/isaiashunter/code/nomade-ios` | Native SwiftUI iPhone app | `runAs-hunter/nomade-ios` |

The iPhone never talks to Anthropic. It calls `nomadeapp`, which holds the key.
Both repos are on `main`, both level with `origin` (0 ahead, 0 behind).

Latest commits: `nomadeapp` at `5e814ef`, `nomade-ios` at `965291a`.

---

## 2. Current state in one paragraph

Backend is live in production at **https://nomade-eight.vercel.app**, auto-deploying
on every push to `main`. iOS build **1.0 (1)** was archived, validated, and
**successfully uploaded to App Store Connect on 2026-07-31 at 13:41 local**
(`uploadEvent.state = success`, zero errors, app record `adamId 6796520727`,
team `LXT8T4YQR6`). The build then sat in App Store Connect flagged
**"Missing Compliance"**, because the uploaded binary had no
`ITSAppUsesNonExemptEncryption` key. That flag makes internal TestFlight testers
see "no builds available", which is where the last session ended. The fix is a
web-UI answer, not a code change. Whether it has been answered since is
**unknown** - it happens server-side and leaves no local trace.

---

## 3. Roadmap and status

Epic-level work is issue-tracked. Verified open/closed state as of 2026-08-19.

### `runAs-hunter/nomade` (backend)

| # | Title | Real status |
|---|---|---|
| 1 | `POST /api/route` chat topic routing/classify endpoint | **Looks already done, issue never closed.** `src/app/api/route/route.ts` exists and `src/lib/__tests__/route.test.ts` has 14 passing tests. Verify against the issue's acceptance criteria, then close. |
| 2 | Content endpoint: serve `italy.json` for iOS fetch-and-cache | **Not built.** No `/api/content` route exists. iOS currently ships `italy.json` bundled in `Resources/`. The locked decision (T1-A) is fetch-and-cache, so this is genuine remaining work. |
| 3 | Harden public endpoints: rate limit + App Attest + PII logging | **Not started. Gates PUBLIC launch, not TestFlight.** See §5. |

### `runAs-hunter/nomade-ios` (client)

| # | Title | Real status |
|---|---|---|
| 1 | EPIC: iOS v1, chat MVP to shippable App Store app | Open umbrella. Closes when #10 closes. |
| 10 | E8: App Store readiness (HTTPS, privacy, remove DebugBridge, TestFlight) | **Nearly done.** HTTPS-only: done. Privacy policy: hosted. DebugBridge: fully stripped and proven. Archive validated (AC7): done. Upload: done. **Open: AC1 + AC6, a real streamed reply received on the physical device via a TestFlight install.** |

Closed and shipped: E0 design tokens + Geist font, E1 `personalize()` port to Swift,
E2 SwiftData persistence, E3 onboarding quiz, E4 journey/checklist screen,
E5 reminders + local notifications, E6 smart chat threads + routing, E7 app shell.

---

## 4. Immediate next actions, in order

**4.1 Answer export compliance (human only, ~30 seconds).**
App Store Connect -> Apps -> Nomade -> TestFlight -> Builds -> `1.0 (1)` ->
Manage on the Missing Compliance flag. The question is "What type of encryption
algorithms does your app implement?" and the answer is
**"None of the algorithms mentioned above"**.

That answer was verified against source, not assumed: no `CryptoKit`,
`CommonCrypto`, or `Security` imports anywhere; no Keychain; no AES/SHA/SecKey
usage; zero SPM packages (both package sections in `project.pbxproj` are empty
Begin/End markers); and `otool -L` on the uploaded binary links no crypto
libraries. The only encryption in the app is the TLS iOS performs for
`URLSession.shared` in `ChatService.swift:54` and `RoutingService.swift:28`.
Do **not** pick "Standard encryption algorithms instead of, or in addition to,
using or accessing the encryption within Apple's operating system" - that path
demands App Encryption Documentation the app does not need.

If the build is **absent** rather than flagged, processing rejected it and Apple
emailed the Account Holder. Read that email before doing anything else.

**4.2 Confirm the tester plumbing (human only).**
TestFlight -> Internal Testing -> the group. The build `1.0 (1)` must be attached
(turn on "Automatically distribute new builds"), and the tester row must read
**Accepted**, not Invited. On the phone, TestFlight must be signed into the same
Apple Account that holds the tester slot. Note the signing identity is
`isaiasmosiah@gmail.com` while the shipped privacy contact is
`aletheodoxa@gmail.com`; a phone signed into the wrong one shows an empty
TestFlight and looks identical to this bug.

**4.3 Close iOS #10 (human verifies, agent can close).**
Install via TestFlight on "Isaias Iphone", send a chat, confirm a real streamed
reply over HTTPS. That is AC1 + AC6. Then close #10 and the EPIC.

**4.4 Then the backend queue (agent work).**
Verify and close nomade#1. Build nomade#2 (content endpoint + iOS fetch-and-cache).
Then nomade#3 before any public launch.

---

## 5. Locked decisions. Do not re-litigate these.

These were settled in a CEO review, a full eng review (13 findings folded, 0
unresolved), and a design review. Reversing one is allowed but must be explicit.

- **Hosting is Vercel git-integration, not the CLI.** Push to `main` deploys prod.
- **`ANTHROPIC_API_KEY` lives only on the server.** Set as a Production env var in
  Vercel; locally in `.env.local`, which is gitignored by the `.env*` rule. A
  shipped app bundle is extractable, so the key must never reach the client.
- **The privacy policy is a code deliverable**, not an ops task. It ships as
  `src/app/privacy/page.tsx` at `/privacy` in the same deploy. Contact email
  `aletheodoxa@gmail.com`.
- **nomade#3 gates public launch, not TestFlight.** Internal TestFlight is
  invite-only to one device, so rate limiting and App Attest come after.
- **Content is generated from a single source.** `src/data/countries/italy.yaml`
  and `src/data/quiz.ts` are authoritative; `npm run gen:ios` derives the iOS
  `italy.json` / `quiz.json` plus shared parity test vectors. Never hand-edit the
  generated JSON in the iOS repo (decision 1A).
- **Profile lives in chat context** (decision 2A).
- **Chat suggests, it does not auto-route** (Approach A).
- **iOS caches content fetched from the backend** rather than bundling forever
  (decision T1-A). This is what nomade#2 implements.
- **Backend posture is rate limit + App Attest + PII-safe logging** (decision T2-A).
- **Design system carries into SwiftUI via a token layer + bundled Geist**, not
  ad-hoc styling. `Nomade/Nomade/DesignSystem/`.
- **Release archive/validate/upload goes through the Xcode Organizer GUI**, not
  `xcodebuild`, for App Store submissions.

---

## 6. Landmines, all verified the hard way

1. **`next build` needs `allowImportingTsExtensions`.** `src/data/quiz.ts` uses
   `.ts`-extension imports. Dev and Turbopack never surface it; the production
   type-check fails without the flag. It is set in `tsconfig.json`. Do not remove it.
2. **SPM products link unconditionally, so `#if DEBUG` in source is not enough.**
   The gstack DebugBridge was force-loaded into the Release binary even with all
   its call sites `#if DEBUG`-gated, proven with `nm`. Removing source wiring is
   insufficient; the xcodeproj Frameworks-phase linkage and the package directory
   must go too. That is what `965291a`'s parent `ac4e2ee` did. If you ever
   reinstall the QA bridge, strip it again before archiving.
3. **Build number `1` is spent.** Apple rejects a duplicate `CFBundleVersion`.
   Any further `1.0` upload needs `CFBundleVersion = 2`.
4. **Two archives exist for 2026-07-31 and only one shipped.** `Nomade 7-31-26,
   1.32 PM.xcarchive` is the uploaded one. The `11.56 AM` archive was
   validate-only and sits right above it in the Organizer. Do not re-upload it.
5. **The two Info.plists are not interchangeable.**
   `Nomade/Info.plist` is Release: no ATS exception, holds the new
   `ITSAppUsesNonExemptEncryption = false`, and reads
   `NomadeAPIBaseURL = $(NOMADE_API_BASE_URL)`.
   `Nomade/Info-Debug.plist` is Debug: carries `NSAllowsArbitraryLoads` so the
   phone can reach the LAN dev server. Wired via `INFOPLIST_FILE` per config.
6. **`AppConfig.swift:29` has a placeholder fallback**
   (`https://REPLACE-WITH-PROD-HOST.example.com`) used only if the
   `NOMADE_API_BASE_URL` build setting is missing. The uploaded binary correctly
   embedded the real origin, so the fallback is dormant. If a build ever points at
   `example.com`, that build setting got dropped.
7. **Synthesized taps do not fire SwiftUI Button actions** (observed iOS 26.4).
   Only relevant if the gstack QA bridge is reinstalled via `/ios-sync`. Drive
   button flows through a state hook or `.accessibilityAction` instead.
8. **`.claude/skills/` and `.gstack/` in `nomadeapp` are agent tooling, not
   product code.** A copy of gstack is committed at `.claude/skills/gstack/`.
   Ignore all of it when reasoning about the app.
9. **The test phone has outrun the toolchain.** "Isaias Iphone" is on iOS 27.0;
   the installed Xcode is 26.4. The developer disk image will not mount, so
   `devicectl install` / `launch` and `xcodebuild test` against the device all
   fail with "Timed out waiting for all destinations ... The developer disk image
   could not be mounted on this device." Verified 2026-08-19. Compiling for a
   device destination still works. Run unit tests on the iOS 26.4 simulator.
   **TestFlight is currently the only way to get a build onto that phone**, which
   makes §4 the only path to verifying anything on real hardware. Fixing it means
   an Xcode that supports iOS 27.0.

---

## 7. Which docs to trust

| File | Status |
|---|---|
| `nomadeapp/CODEX-HANDOFF.md` | This file. Cross-repo roadmap and launch state |
| `nomadeapp/AGENTS.md` | Standing Next.js 16 instruction. Auto-loaded by Codex |
| **`nomade-ios/AGENTS.md`** | **Source of truth for the iOS app.** Rewritten from the code 2026-08-19 |
| `nomade-ios/CLAUDE.md` | `@AGENTS.md` include plus the gstack tooling layer only |
| `nomade-ios/README.md` | **Still stale.** Dated 2026-07-01, describes the app as a chat-only MVP and presents the gstack QA path as working. Not yet rewritten |

The iOS docs used to be badly out of date: they described a single-screen chat app
with a live DebugBridge, four epics after that stopped being true. That is fixed,
and `nomade-ios/AGENTS.md` carries a rule to update it in the same commit as any
change it describes. Hold to that rule; this project's docs rot fast.

---

## 8. Layout and commands

### `nomadeapp`

Next.js **16.2.1**, React **19.2.4**, TypeScript 5.9, Tailwind 4, Vitest 3.2.4,
`@anthropic-ai/sdk` 0.80, Zod 4. Local Node is **v23.2.0**.

```
src/app/            page.tsx, quiz/, plan/, privacy/, api/chat/, api/route/
src/components/     Button, Badge, ProgressBar, QuizOption, TaskItem, CountryCard, AIExpandableDrawer
src/data/           quiz.ts, schema.ts, route-schema.ts, nationality-groups.ts,
                    countries/italy.yaml, knowledge/italy.md
src/engine/         personalize.ts  (the deterministic checklist engine)
src/lib/            route-classify.ts, loadCountry.ts, storage.ts
scripts/            gen-country-json.mjs, gen-quiz-json.mjs, sync-test-vectors.mjs
```

```bash
npm run dev                  # local dev server
npm run dev -- -H 0.0.0.0    # bind all interfaces so the iPhone can reach it
npm test                     # vitest run
npm run build                # production build (this is what catches type errors)
npm run lint
npm run gen:ios              # regenerate iOS italy.json + quiz.json + parity vectors
```

**Test baseline, run 2026-08-19: 45 tests across 4 files, all passing.**
`route.test.ts` prints a `Route API error: Error: bad json` line to stderr on
purpose - it is the degraded-fallback case asserting a 200. Not a failure.

`AGENTS.md` in this repo carries a standing instruction: this is Next.js 16 with
breaking changes from older conventions, so read the relevant guide in
`node_modules/next/dist/docs/` before writing Next code rather than working from
memory. Honor that.

### `nomade-ios`

Xcode project `Nomade/Nomade.xcodeproj`, scheme `Nomade`, 44 Swift files.

```
Nomade/Nomade/          NomadeApp.swift, AppConfig.swift, ChatView/ChatViewModel/
                        ChatService/ChatModels
  Chat/                 ChatTopic, RoutingService, ThreadListView, ThreadsViewModel, ThreadView
  DesignSystem/         Palette, Typography, Spacing, Badge, ProgressBar, QuizOption, Gallery
  Domain/               UserProfile, CountryData, PersonalizedChecklist
  Engine/               Personalize.swift  (Swift port, parity-tested against TS)
  Onboarding/           WelcomeView, QuizView, QuizViewModel, QuizStep
  Journey/              JourneyView, JourneyViewModel, PhaseSection, TaskRow
  Profile/              ProfileView, ProfileViewModel
  Reminders/            MilestoneRules, ReminderScheduler, SystemNotificationScheduler,
                        ItalianCalendar, MilestoneEntryView
  Shell/                RootView, MainTabView, StateViews
  Store/                AppStore, Models
  Resources/            italy.json, quiz.json, Geist-Variable.ttf (+ OFL license)
Nomade/NomadeTests/     Engine, Journey, DesignSystem, Quiz, Shell, Chat, Store, Reminder tests
```

Tests run on the simulator, and installing to the device is currently broken (see
landmine 9). Both verified 2026-08-19:

```bash
# unit tests, ** TEST SUCCEEDED **
xcodebuild -project Nomade/Nomade.xcodeproj -scheme Nomade \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/nomade-sim-test test

# device build, ** BUILD SUCCEEDED ** (compiles and signs, does not touch the phone)
xcodebuild -project Nomade/Nomade.xcodeproj -scheme Nomade -configuration Debug \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/nomade-build \
  -allowProvisioningUpdates CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=LXT8T4YQR6 build
```

Full command set, both device identifiers, and the LAN prerequisites are in
`nomade-ios/AGENTS.md`. Do not duplicate them here.

To prove what an archive actually did, read its own record rather than guessing:

```bash
A=$(ls -dt ~/Library/Developer/Xcode/Archives/*/*.xcarchive | head -1)
/usr/libexec/PlistBuddy -c "Print :Distributions" "$A/Info.plist"
```

`task = validate` versus `task = distribute`, plus `uploadEvent.state` and
`.date`, is the authoritative local answer to "did this build ship".

---

## 9. Definition of done

**TestFlight (v1 internal):** iOS #10 AC1 + AC6 verified on the physical device,
#10 and the EPIC closed.

**App Store submission:** App Store Connect metadata and screenshots, which
nobody has started.

**Public launch:** nomade#3 shipped first. Rate limiting, App Attest or another
token scheme on `/api/chat` and `/api/route`, and PII-safe logging. Today those
endpoints are open to anyone who finds the URL, which is acceptable for one
invited tester and not acceptable past that.

---

## 10. Notes for Codex specifically

- Codex reads `AGENTS.md` at a repo root. **Both repos now have one.**
  `nomadeapp/AGENTS.md` carries the Next.js 16 instruction; `nomade-ios/AGENTS.md`
  is the full iOS reference and loads automatically when you work in that repo.
- This file is not auto-loaded anywhere. Feed it explicitly, or add a pointer line
  to `nomadeapp/AGENTS.md`.
- Pushing `nomadeapp` to `main` deploys to production. There is no staging branch.
- Prior sessions logged durable decisions and learnings under
  `~/.gstack/projects/runAs-hunter-nomade/`, including a saved checkpoint at
  `checkpoints/20260731-140019-nomade-launch-ops.md`. That is historical context,
  not instructions, and §7 shows how fast this project's docs go stale. Verify
  before trusting any of it.
