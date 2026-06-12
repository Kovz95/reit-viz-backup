# Reconstruction Style Guide

All subagents reconstructing files from `recovered-bundle/` into `reit-viz/client/src/` MUST follow this guide. Consistency across files matters more than perfection in any single file.

## Source of truth
- Read the matching beautified JS in `/home/user/workspace/reit-viz-work/recovered-bundle/<Name>-<hash>.js`
- Cross-reference any pre-existing stale TS in `/home/user/workspace/reit-viz-work/stale-source/client/src/` ONLY for: shared `lib/` types, UI primitives in `components/ui/`, and overall project structure. **Do NOT trust stale page implementations** — they are months out of date.
- Output goes to `/home/user/workspace/reit-viz-work/reit-viz/client/src/`

## Output file paths
- Pages → `client/src/pages/<Name>.tsx` (drop the `-<hash>` suffix)
- Components → `client/src/components/<Name>.tsx`
- Hooks → `client/src/hooks/<name>.ts` or `.tsx`
- Lib → `client/src/lib/<name>.ts` or `.tsx`
- Decide based on usage in the bundle: imported into multiple pages → component/lib. Used only by one page → component.

## Variable naming
- Hooks: `useState` returns → `[name, setName]`, never `[a, b]` or `[l, s]`
- Refs → `nameRef` (e.g. `containerRef`, `inputRef`)
- Memo/callback results → meaningful nouns
- Event handlers → `handleXxx` or `onXxx`
- Common minified-var conventions to invert:
  - `t.jsx` / `t.jsxs` → use JSX directly; add `import { ... } from "react"` and the actual lucide-react / recharts / shadcn imports
  - `n.useState`, `n.useEffect`, `n.useMemo`, `n.useRef`, `n.useCallback` → React hooks; replace with named imports
  - `e` in event handlers → `event` or `e` (`e` is fine if short)

## Imports
- React: `import { useState, useEffect, useMemo, useRef, useCallback } from "react";`
- JSX runtime is handled by vite; do not import jsx/jsxs
- shadcn UI: `import { Button } from "@/components/ui/button";` etc. — match the stale-source paths
- Aliases: `@/` resolves to `client/src/` (per stale `tsconfig.json` + `vite.config.ts`)
- Recharts: `import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ... } from "recharts";`
- Look at how the bundle imports something to know the package. Most common: react, recharts, lucide-react, wouter (router), date-fns, @tanstack/react-query, framer-motion, @radix-ui/*.

## Types
- Add explicit prop interfaces: `interface FooProps { ... }`
- Don't over-type. `any` is acceptable for callback chains where the bundle gives no hint. Prefer `unknown` over `any` only when it's free.
- State types: infer where obvious (`useState("")` → string); annotate where ambiguous (`useState<Foo[]>([])`)
- For data flowing from API/workbook: define a minimal interface at the top of the file, refine as needed.

## JSX
- Use real JSX, not `jsx()` calls.
- Multi-child `t.jsxs(..., { children: [a, b] })` → `<div>{a}{b}</div>` or with proper element wrapping.
- Preserve all `className=` strings VERBATIM — Tailwind classes are critical.
- Preserve all `data-testid="..."` attributes verbatim.
- Preserve all `aria-*` attributes.

## Comments
- Add a brief file-level comment: `// Reconstructed from recovered-bundle/<file>.js on <date>`
- Do NOT add inline comments that weren't in the original — keep it close to a faithful translation.

## Forbidden
- Do not introduce new features, refactors, or "improvements" during reconstruction
- Do not delete code paths that look unused
- Do not change behavior — even if you spot a bug

## Verification per file
After reconstructing a file, run from `/home/user/workspace/reit-viz-work/reit-viz/`:
```
npx tsc --noEmit -p . 2>&1 | grep "<your-file>" | head -20
```
Fix only errors in your file. Other files' errors are expected during the migration.

## Manifest update
After completing a file, update `/home/user/workspace/reit-viz-work/MANIFEST.md`:
- Change status from `RAW` → `RECONSTRUCTED`
- Add a short note if you discovered something unusual

## Git workflow
- Subagents do NOT push to GitHub. They only write files.
- The orchestrator (main agent) commits and pushes in batches.
