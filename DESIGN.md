# Design System — Nomade

## Product Context
- **What this is:** A mobile-first visa intelligence platform that guides digital nomads through the Italy visa application process with a personalized quiz → checklist flow and AI assistant.
- **Who it's for:** Digital nomads (US, EU, and other nationalities) seeking Italy's Visto per Nomadi Digitali. Mobile-first users — often on the move.
- **Space/industry:** Immigration/travel tech. Competitors: visadb.io (hire-an-expert marketplace), nomadgate.com (editorial blog), nomads.com (city comparison community).
- **Project type:** Mobile-first progressive web app (PWA). Primary viewport: 390px. Max-width: 480px centered on tablet/desktop.

## Aesthetic Direction
- **Direction:** Editorial/Precision
- **Decoration level:** Minimal. Typography does all the work. No illustrations, no gradients, no decorative icons.
- **Mood:** A task runner disguised as a visa guide. Feels like Linear or iA Writer — authoritative, precise, trustworthy. Like a well-organized legal brief prepared by someone who's actually done this. NOT a travel blog or marketplace.
- **Differentiator:** Every competitor in the visa/nomad space treats visa information as a content-discovery problem (card grids, articles, expert marketplaces). Nomade treats it as what it actually is: a sequential task-completion problem. The design signals this — it looks like a productivity tool, not a travel platform.
- **Reference sites:** visadb.io (what we're NOT), Linear.app (structural feel), iA Writer (typographic precision)

## Typography
- **Primary typeface:** Geist — single typeface for all roles (display, body, UI, data)
  - Designed by Vercel specifically for application interfaces
  - Excellent tabular numeral support (critical for €28,000 and timeline numbers)
  - Not overused — distinct from the Inter monoculture
  - Variable font (100–900 weight range from single file)
- **Display/Logo:** Geist 700, `letter-spacing: -0.04em` — used for the "nomade" wordmark
- **Screen titles:** Geist 600, `letter-spacing: -0.03em`
- **Section/task titles:** Geist 500
- **Body/descriptions:** Geist 400, `line-height: 1.6`
- **Labels/phases:** Geist 600, uppercase, `letter-spacing: 0.08em`, 10–12px
- **Data/financials:** Geist 500, `font-variant-numeric: tabular-nums` — REQUIRED for all financial figures (€28,000, timelines, costs)
- **Loading strategy:** Google Fonts CDN
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap" rel="stylesheet">
  ```
- **Scale:**
  | Token | Size | Weight | Use |
  |-------|------|--------|-----|
  | display | 40px | 700 | Logo/wordmark |
  | heading | 24px | 600 | Screen titles |
  | subheading | 18px | 500 | Section headers |
  | body | 15px | 400 | Task details, descriptions |
  | small | 13px | 400 | Secondary details |
  | label | 12px | 600 | Uppercase labels, phases |
  | caption | 12px | 400 | Metadata, hints |

## Color
- **Approach:** Restrained — one accent, one accent-light, neutrals. Color is rare and meaningful. When something is colored, the user notices.

### Palette
| Token | Hex | Use |
|-------|-----|-----|
| `--text-primary` | `#111111` | All primary text |
| `--text-secondary` | `#555555` | Descriptions, secondary labels |
| `--text-tertiary` | `#888888` | Phase labels (uppercase only), metadata |
| `--accent` | `#4945C2` | "Personalized for you" badges, progress fill (alt), links, AI citations |
| `--accent-light` | `#EEEEF9` | Badge backgrounds, accent surfaces |
| `--bg` | `#F8F8F5` | App background (warm white — reduces eye strain for long reading sessions) |
| `--surface` | `#FFFFFF` | Cards, task rows, modal backgrounds |
| `--border` | `#E8E8E8` | All borders, dividers, checkbox unchecked |

### Semantic Colors
| Token | Hex | Light | Use |
|-------|-----|-------|-----|
| `--success` | `#16A34A` | `#DCFCE7` | Completed states (future feature) |
| `--warning` | `#D97706` | `#FEF3C7` | Data freshness warnings |
| `--error` | `#DC2626` | `#FEE2E2` | Important task tags, destructive actions |
| `--info` | `#4945C2` | `#EEEEF9` | Same as accent |

### Contrast Requirements (WCAG AA minimum)
| Usage | Foreground | Background | Ratio | WCAG |
|-------|-----------|-----------|-------|------|
| Body text | `#111111` | `#F8F8F5` | 17.9:1 | AAA ✓ |
| Secondary text | `#555555` | `#F8F8F5` | 5.7:1 | AA ✓ |
| Tertiary (uppercase labels only) | `#888888` | `#F8F8F5` | 3.8:1 | AA large ✓ |
| **WARNING: never use `#AAAAAA` for text** | `#AAAAAA` | `#F8F8F5` | 2.2:1 | FAIL |
| Accent badge text | `#4945C2` | `#EEEEF9` | 5.1:1 | AA ✓ |
| Destructive tag | `#DC2626` | `#FEE2E2` | 4.5:1 | AA ✓ |

### Dark Mode
CSS custom properties strategy — `[data-theme="dark"]` on `<html>`:
- Background: `#0E0E0C`, Surface: `#1A1A18`, Borders: `#2A2A28`
- Text primary: `#EFEFEC`, secondary: `#AAAAAA`, tertiary: `#666666`
- Accent: `#7B78E8` (lightened for dark bg contrast)
- Reduce accent saturation ~15% in dark mode

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable (not tight — mobile users need generous tap targets)
- **Scale:**
  | Token | Value | Use |
  |-------|-------|-----|
  | `space-1` | 4px | Icon gaps, tight internal spacing |
  | `space-2` | 8px | Between label and value, tight compound elements |
  | `space-3` | 12px | Between task rows (border-separated) |
  | `space-4` | 16px | Card padding, section internal padding |
  | `space-6` | 24px | Between sections, progress bar to content |
  | `space-8` | 32px | Between major page sections |
  | `space-12` | 48px | Page-level vertical rhythm |

## Layout
- **Approach:** Grid-disciplined, single-column
- **Primary target:** 390px wide (iPhone 15 Pro). All designs pixel-perfect here.
- **Small mobile:** 375px — test for breakage, don't design for it
- **Large mobile:** 430px — more breathing room, don't stretch
- **Tablet/desktop:** Max-width 480px, centered with horizontal padding 24px. Nomade is a mobile product.
- **Border radius:**
  | Token | Value | Use |
  |-------|-------|-----|
  | `radius-sm` | 4px | Checkboxes |
  | `radius-md` | 8px | Small UI elements |
  | `radius-lg` | 12px | Cards, buttons, quiz options |
  | `radius-xl` | 16px | Country cards |
  | `radius-full` | 9999px | Badges, progress bar, pills |
- **No shadow system.** Separation via border only (`1px solid #E8E8E8`). Featured/selected states use `1.5px solid #111111`.

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Never:** decorative animations, scroll-driven effects, entrance animations on static content
- **Defined transitions:**
  | Element | Duration | Easing | Trigger |
  |---------|---------|--------|---------|
  | Task checkbox fill | 150ms | ease-out | tap/click |
  | Progress bar fill | 300ms | ease-out | task completion |
  | Quiz step transition | 200ms | ease-in-out | continue tap (slide left) |
  | Quiz option selection | 100ms | ease-out | tap/click |
  | AI drawer expand | 200ms | ease-out | "?" icon tap |
  | Toast notification | 150ms in / 200ms out | ease | trigger event |
  | Border state changes | 150ms | ease | focus/selection |

## Touch & Accessibility
- **Minimum touch target:** 44×44px for ALL interactive elements (Apple HIG + WCAG 2.5.5)
- **Keyboard navigation:** Arrow keys for quiz options, Space/Enter to toggle tasks, Escape to close drawers
- **ARIA requirements:**
  - Progress bar: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Plan progress"`
  - Task checkboxes: `aria-label="[Task name] — [completed/not completed]"`
  - AI drawer trigger: `aria-expanded="true/false"`
  - AI response: `aria-live="polite"`
  - Quiz progress: `aria-label="Step N of 5"`

## Components (minimum viable set — define before building)
Each component must be fully specified before implementation. See design doc for interaction state table.

1. **`<Button>`** — primary (filled `#111`), secondary (outlined), disabled state. Full-width on mobile.
2. **`<CountryCard>`** — featured variant (`1.5px #111` border) + muted variant (opacity 40% for Coming Soon)
3. **`<QuizOption>`** — unselected (1.5px `#E8E8E8`), selected (1.5px `#111` + filled radio dot)
4. **`<TaskItem>`** — unchecked, checked (strikethrough + filled checkbox `#111`), badge variants
5. **`<ProgressBar>`** — animated fill, aria-valuenow, `#111` fill
6. **`<AIExpandableDrawer>`** — collapsed (task "?" icon `#888`), expanded (inline dashed-border panel)
7. **`<Badge>`** — personalized (indigo), time (gray), cost (amber), important (red)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Initial design system created | /design-consultation based on competitive research (visadb.io, nomadgate.com, nomads.com) |
| 2026-03-21 | Geist over Inter | More distinctive, designed for app interfaces, better tabular-nums. Inter is overused. |
| 2026-03-21 | Indigo #4945C2 over standard blue | Every competitor uses generic corporate blue. Indigo reads "expert tool" not "government form." Stands out without sacrificing trust. |
| 2026-03-21 | No shadow system | Border-only separation is rarer in SaaS and feels more like a precise document. Requires disciplined spacing. |
| 2026-03-21 | Single typeface (Geist only) | Maximum coherence — no serif/sans collision risk. "The design system that has only one moving part is more resilient than one with many." |
| 2026-03-21 | #AAAAAA banned for text | Contrast ratio 2.2:1 on warm white — WCAG fail. Minimum tertiary text: #888888. |
| 2026-03-21 | Editorial/Precision aesthetic | First-principles reasoning: every competitor treats visa info as content discovery. Visa applications are sequential task completion. Design should match the actual mental model. |
