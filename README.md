# openloaf

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Hono, TRPC, and more.

## Features

* **TypeScript** - For type safety and improved developer experience

* **Next.js** - Full-stack React framework

* **TailwindCSS** - Utility-first CSS for rapid UI development

* **shadcn/ui** - Reusable UI components

* **Hono** - Lightweight, performant server framework

* **tRPC** - End-to-end type-safe APIs

* **Node.js** - Runtime environment

* **Prisma** - TypeScript-first ORM

* **SQLite/Turso** - Database engine

* **Turborepo** - Optimized monorepo build system

* **PWA** - Progressive Web App support

* **Husky** - Git hooks for code quality

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses SQLite with Prisma.

1. Start the local SQLite database:

```bash
cd packages/db && pnpm run db:local
```

1. Update your `.env` file in the `apps/server` directory with the appropriate connection details if needed.

2. Generate the Prisma client and push the schema:

```bash
pnpm run db:push
```

Then, run the development server:

```bash
pnpm run dev
```

Open <http://localhost:3001> in your browser to see the web application.
The API is running at <http://localhost:3000>.

## Project Structure

```
openloaf/
├── apps/
│   ├── web/         # Frontend application (Next.js)
│   └── server/      # Backend API (Hono, TRPC)
├── packages/
│   ├── api/         # API layer / business logic
│   └── db/          # Database schema & queries
```

## Available Scripts

* `pnpm run dev`: Start all applications in development mode

* `pnpm run build`: Build all applications

* `pnpm run dev:web`: Start only the web application

* `pnpm run dev:server`: Start only the server

* `pnpm run desktop`: Start the Electron app (dev)

* `pnpm --filter desktop run make`: Build Electron distributables (DMG/ZIP) to `apps/desktop/out/make`

* `pnpm --filter desktop run make:noproxy`: Same as above but ignores proxy env vars (`http_proxy` / `https_proxy`)

* `pnpm run check-types`: Check TypeScript types across all apps

* `pnpm run db:push`: Push schema changes to database

* `pnpm run db:studio`: Open database studio UI

* `cd apps/web && pnpm run generate-pwa-assets`: Generate PWA assets

## Desktop Production Config

* Packaged app reads env from `~/.openloaf/.env` (API keys, etc.)

* Unified data directory: `~/.openloaf` (Windows: `%USERPROFILE%\\.openloaf`)

* Default DB path: `~/.openloaf/openloaf.db` (auto-initialized on first run)

* Default workspace directory:
  * macOS: `~/Documents/OpenLoafWorkspace`
  * Linux: `~/OpenLoafWorkspace`
  * Windows: `D:\OpenLoafWorkspace` (fallback to `%USERPROFILE%\\OpenLoafWorkspace` if no D drive)

## License & Commercial Licensing

This project is dual-licensed:

1. **GNU Affero General Public License v3.0 (AGPLv3)**  
   OpenLoaf is open source and free to use under the terms of the AGPLv3. If you modify the code or provide it as a service over a network (e.g., SaaS), you must open-source your modifications and full related codebase under the same license. See the [`LICENSE`](./LICENSE) file for details.

2. **Commercial License**  
   If you wish to use OpenLoaf in a commercial product, distribute it as closed-source, or use it without being subject to the AGPLv3 requirements, please contact us to purchase a commercial license.

---

*By contributing to this project, you agree to sign our [Contributor License Agreement (CLA)](./.github/CLA.md).*
