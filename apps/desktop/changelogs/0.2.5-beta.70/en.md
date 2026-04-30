# OpenLoaf Desktop 0.2.5-beta.70

> Hotfix for the publish pipeline. Beta.69 installers + manifests reached COS / R2 fine, but the cleanup step at the end of `publish-finalize` failed against COS, which in turn skipped the GitHub Release. End users on download.json were unaffected; this release restores the GitHub Release path.

## 🐛 Fixes

- **`publish-finalize` cleanup compatible with Tencent COS.** The shared `cleanupOldVersions` helper used `DeleteObjectsCommand` (batch, up to 1000 keys per call) which works on R2 and native S3 but fails on COS with `InvalidRequest: Missing required header for this request: Content-MD5`. AWS SDK v3 dropped automatic Content-MD5 in favour of `x-amz-sdk-checksum-algorithm`; COS does not yet honour the new header. Switched to single-object `DeleteObjectCommand` calls with a small concurrency window — works against R2 / COS / S3 alike, and the runtime cost is a few extra seconds per release.

## ℹ️ Notes

- Beta.69 itself is functional via the website / `download.json` / direct COS / R2 URLs. Only the GitHub Release page for desktop@0.2.5-beta.69 is missing; this release brings back the GitHub Release pipeline.
- No app-side behaviour change.
