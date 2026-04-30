# OpenLoaf Desktop 0.2.5-beta.66

> Infrastructure release. Auto-update artifacts now mirror to Tencent COS in addition to Cloudflare R2 so users in mainland China get noticeably faster downloads. Existing installs keep pulling from R2 — nothing changes for them in this version.

## 🚀 Improvements

- **R2 → R2 + Tencent COS dual-publish.** Server, web and desktop release pipelines now upload every artifact and manifest to both Cloudflare R2 (海外) and Tencent COS (国内, via global accelerate endpoint). When TENCENT_* secrets are absent the COS leg is skipped silently, so external forks keep working unchanged.
  - `apps/server/scripts/publish-update.mjs` and `apps/web/scripts/publish-update.mjs` gained `uploadFileToAll` / `uploadJsonToAll` wrappers and changelog dual-write, mirroring what desktop already had.
  - All three publish workflows (`publish-server.yml`, `publish-web.yml`, `publish-desktop.yml`) now inject `TENCENT_COS_*` / `TENCENT_SECRET_*` secrets next to the R2 ones.
- **COS env var names aligned with OpenSpeech.** Renamed `COS_*` to `TENCENT_*` in `scripts/shared/publishUtils.mjs` and `scripts/sync-r2-to-cos.mjs` so the Tencent credentials can be reused across repos. Local `.env.prod` files need the same rename — see Notes.

## ℹ️ Notes

- No application code changes. The desktop binary is rebuilt only to pick up the new CI pipeline; this release is functionally identical to 0.2.5-beta.65.
- Default update endpoint is unchanged — `https://openloaf-update.hexems.com` (R2) — so old clients keep auto-updating. Switching new clients to the COS endpoint will land in a follow-up release once COS has been verified to receive a full set of artifacts.
- If you rely on `node scripts/sync-r2-to-cos.mjs` locally, rename the six `COS_*` keys in `apps/desktop/.env.prod` to `TENCENT_*` before running it again.
