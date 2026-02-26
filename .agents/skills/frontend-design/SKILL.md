---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
license: AGPLv3 + Commercial License
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## OpenLoaf Project Button Color Standard (From Email Module)

When working in this repo, button colors should default to the email module palette unless a feature explicitly defines another brand/system palette.

Reference sources:
- `apps/web/src/components/email/EmailForwardEditor.tsx`
- `apps/web/src/components/email/EmailMessageList.tsx`
- `apps/web/src/components/email/EmailSidebar.tsx`

Recommended semantic tokens:

```css
:root {
  --btn-primary-bg: #0b57d0;
  --btn-primary-bg-hover: #0a4cbc;
  --btn-primary-fg: #ffffff;

  --btn-neutral-fg: #5f6368;
  --btn-neutral-bg-hover: #e8eaed;

  --btn-success-fg: #188038;
  --btn-success-bg: #e6f4ea;
  --btn-success-bg-hover: #ceead6;

  --btn-warning-fg: #f9ab00;
  --btn-danger-fg: #d93025;
  --btn-accent-fg: #9334e6;
  --btn-info-fg: #1a73e8;
}
```

Semantic mapping:
- Primary action button (e.g. send/confirm): `--btn-primary-*`
- Neutral ghost/secondary action (e.g. cancel/attachment/tools): `--btn-neutral-*`
- Success utility action (e.g. sync/add account): `--btn-success-*`
- Warning emphasis action (e.g. archive/star): `--btn-warning-fg`
- Danger/destructive action (e.g. delete/remove): `--btn-danger-fg`
- Accent/overflow action (e.g. more menu): `--btn-accent-fg`
- Info/highlight state (e.g. inbox/current indicator): `--btn-info-fg`

Dark mode mapping keeps current token intent:
- Primary: `dark:bg-sky-600` + `dark:hover:bg-sky-500`
- Neutral: `dark:text-slate-300` + `dark:hover:bg-slate-700`
- Success: `dark:bg-[hsl(142_45%_24%/0.55)]` + `dark:text-emerald-300` + `dark:hover:bg-[hsl(142_45%_24%/0.72)]`
- Warning: `dark:text-amber-300`
- Danger: `dark:text-red-300` / `dark:text-red-400`
- Accent: `dark:text-violet-300`
- Info: `dark:text-sky-300`

Implementation rule:
- New frontend UI in this project should reuse these semantics first, then adjust shape, spacing, and motion per feature.
- Avoid inventing new action colors when an existing semantic slot already fits.

## OpenLoaf 源码规范

### 版权声明 (License Header)

**所有新建的源代码文件 (.ts, .tsx, .js, .jsx, .mjs, .cjs) 必须在文件顶部包含以下版权声明。** 这是为了确保项目在 AGPLv3 双授权模式下的法律合规性。

```javascript
/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
```

如果文件包含 Shebang (例如 `#!/usr/bin/env node`)，请将版权声明放在 Shebang 之后，并空开一行。

可以使用以下命令自动补全缺失的声明：
```bash
node scripts/add-headers.mjs
```

