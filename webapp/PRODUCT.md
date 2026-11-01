# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Job seekers in software, mostly developers, preparing for and sitting live interviews: behavioural rounds, recruiter calls, technical screens, coding and system-design rounds. They arrive stressed, often after many applications, and want a tool that answers the live question.
- Consultancies and staffing firms that buy seats for their candidates (enterprise accounts with managed desktop logins).
- The developer/administrator of Novi, who issues licenses, reviews purchase requests, manages accounts and releases from the web workspace.

## Product Purpose

Novi is a bring-your-own-key AI desktop companion for interviews. It captures the live question from the screen or audio and returns answers, code and explanations during the interview, in a transparent overlay. The website sells it, creates accounts, holds the user's AI provider keys and licenses, and hosts the downloads. The admin workspace runs the business: accounts, licenses, purchase requests, provider keys, releases and activity.

## Positioning

An openly stated interview cheating tool with a crude, self-aware voice ("Fuck LeetCode", the Jian Yang parody). It is local and bring-your-own-key: the user pays the AI provider directly, Novi charges for access. One login works on web and desktop for individuals; enterprise teams get managed desktop logins bound to licenses. Competitors it names: Interview Coder and Cluely.

## Operating Context

- Desktop app for macOS, Windows and Linux (Electron). The website is Next.js 16 (App Router), React 19, Tailwind v4 PostCSS plugin installed but the UI is plain CSS and CSS Modules; Prisma with Postgres (Supabase); lucide-react icons.
- Public routes: `/` (landing, with sign-in/sign-up screens toggled by hash), `/features`, `/how-it-works`, `/download`, `/referral`, `/api-keys` (setup guide), `/get-access` (pricing and plans), `/license`.
- The admin and customer workspace is the same `ManagementApp` component rendered at `/` after sign-in. Roles: ADMIN, INDIVIDUAL, STANDALONE (legacy team owner), CORP, SUBCORP, LICENSE (enterprise desktop account). Tabs: Overview, User management, Licenses, API management, Purchase requests, Releases (admin), Activity (admin).
- Workspace has a dark default and a light theme toggle stored in localStorage.
- Payment is manual: purchase requests are reviewed by the administrator; online checkout is a preview that routes to a mailto.

## Capabilities and Constraints

- Plans and prices (single source `src/lib/site.ts`, enforced by `src/shared/plans.ts` and tested): Core $16/month, Pro $45/month, Ultimate $90/month, Lifetime $399 one-time. AI provider usage is billed separately by the provider.
- Supported providers named on the site: OpenAI, Anthropic, Gemini, Kimi.
- Seven session modes; features listed in `src/lib/features.ts`.
- One desktop device active per account at a time. Licenses bind permanently to an account.
- Tests in `webapp/tests` cover copy and plan facts; routes and behaviours must keep working.
- Undecided: online payments (coming later), a YouTube developer demo (link not yet available).

## Brand Commitments

- Name: Novi, wordmark "novi." with the dot in the accent colour; logo at `public/logo.svg` and `public/logo.png`.
- Palette is pinned by the owner: near-black ground with burgundy (`#8f2946` action, `#e4a0b2` accent). Keep it.
- Copy is pinned by the owner for this redesign: the landing page headline ("Fuck LeetCode. Fuck HackerRank. Fuck Assessment. Fuck it RAW." with "(Random Access Wisdom)"), the Jian Yang parody quote section, and the closing "Enough interview bullshit. Bring Novi." stay word for word. Only the visual design changes.
- Voice: blunt, irreverent, honest about what the product is. No corporate softening.

## Evidence on Hand

- The product's own interface: the Electron renderer in `../src/renderer` (real screens exist, no marketing screenshots in `public/`).
- No approved customer testimonials: `src/components/Testimonials.tsx` holds illustrative samples and says so on the page.
- No developer demo video yet (placeholder on the landing page).
- One external image used on the landing page (a Silicon Valley still hot-linked from siliconvalleyism.com) for the parody section.
- Contact: getnoviapp@outlook.com, Instagram @getnoviapp.

## Product Principles

1. Say what it is. The page never pretends Novi is a study aid.
2. The user's key, the user's machine: ownership and privacy of context are features, stated plainly.
3. One login everywhere for individuals; managed logins for teams. The workspace exists to make licenses and keys unambiguous.
4. Admin screens are tools: scanable tables, one clear action per task, no decoration.
5. Facts come from the shared sources (`site.ts`, `plans.ts`, `features.ts`); the UI never restates a price by hand.

## Accessibility & Inclusion

Keyboard operability, visible focus, and prefers-reduced-motion fallbacks are already part of the codebase and must be kept. Text contrast at 4.5:1 on both themes.
