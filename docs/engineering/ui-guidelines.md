# UI Guidelines — Dallio Tasks

> Companion to `code-quality.md`. How the interface looks and behaves. Goal: a calm, professional,
> mobile-first product that reads as deliberate, considered design — never templated or generic.

## 0. Anti-slop rules (hard)

- **No emojis** in UI copy, labels, buttons, headings, or empty states. Plain, precise language.
- **No hand-authored SVG icons.** Use the already-installed **`lucide-react`** (a free, MIT icon library).
  Never inline a bespoke `<svg>` path. If an icon isn't in lucide, pick the closest lucide equivalent or use text.
- **No slop aesthetics:** no gratuitous gradients, glows, neon accents, purple-on-black hero vibes,
  giant rounded blobs, or decorative emoji bullets. No filler marketing copy. Restraint over decoration.
- **No invented brand flourishes.** Match the existing shadcn/ui + zinc design tokens already in the app.

## 1. Design language

- **System:** shadcn/ui (new-york) + Tailwind, zinc base, CSS variables already configured. Reuse tokens
  (`bg-background`, `text-muted-foreground`, `border`, `ring`, radius) — don't hardcode hex.
- **Typography:** the existing Geist font. Clear hierarchy via size/weight, not color noise.
- **Density:** comfortable but efficient. Whitespace to group, not to pad emptily.
- **Motion:** subtle and functional (150–200ms) — collapse/expand, hover, drag. No bouncy/attention-seeking animation.
- **Color:** semantic only — status/priority badges carry meaning; the rest stays neutral. Keep the existing
  badge palette; don't introduce new accent colors without reason.

## 2. Mobile-first & responsiveness

- Design for a **narrow phone first**, then enhance up. The two live views must be usable one-handed on a phone
  **without horizontal scrolling** as the primary interaction.
- Prefer **stacking / card layouts** or column-priority hiding over side-scrolling data tables on small screens.
- Tap targets ≥ 44px; controls reachable; nothing critical hidden behind hover (hover doesn't exist on touch).
- Board columns and lists must work with a **variable number of statuses** (custom statuses are coming).

## 3. Accessibility (WCAG 2.2 AA)

- Every control keyboard-operable and labelled (`aria-label`/`aria-labelledby`); visible focus rings.
- Color is never the only signal (badges pair color with text). Contrast ≥ 4.5:1 for text.
- Collapsible regions use a real `<button>` with `aria-expanded` + `aria-controls`; respect `prefers-reduced-motion`.
- Icon-only buttons carry an accessible name.

## 4. Components & consistency

- New UI reuses existing primitives (`src/components/ui/*`) and the shared controls/hooks. No parallel styles.
- Presentational only — no business logic in components (see `guidelines.md`). Icons from lucide, sized consistently
  (16px inline, 20px actions). One spacing scale (Tailwind), one radius, one shadow depth.
- Empty/loading/error states are first-class, quiet, and helpful — plain text + one clear action, no emoji, no illustration slop.
