@AGENTS.md

## iOS client

This web app is also the **backend for a native iOS app** in the sibling repo
`../nomade-ios` (SwiftUI). That app calls `POST /api/chat` and streams the reply.

- `/api/chat` needs `ANTHROPIC_API_KEY` in `.env.local` (git-ignored). For a
  device to reach this server, run `npm run dev -- -H 0.0.0.0` and keep the phone
  on the same Wi-Fi.
- Full architecture, on-device QA runbook, and gotchas live in
  `../nomade-ios/CLAUDE.md`.
