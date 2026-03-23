---
version: 0.2.5-beta.29
date: 2026-03-23
---

## 0.2.5-beta.29

### ✨ New Features

- **Expanded Board media variants**: Added Volcengine text-to-image variants, face swap mode switching, and updated lip-sync inputs so more SaaS media capabilities can be configured directly inside Board panels.

### 🚀 Improvements

- **SaaS media v3 integration**: Upgraded the media client stack to `@openloaf-saas/sdk` `0.1.21`, switched server-side media calls to the SDK's native v3 APIs, and preserved network retry behavior for more reliable task submission and polling.
- **Board generation controls**: Improved variant naming and selection by using capability-provided tab labels and automatically switching large variant groups to a compact dropdown selector.
- **Media parameter handling**: Refined video generation prompt handling, upscale scale normalization, and task result parsing so Board media requests align better with the latest SaaS API contract.

### 💄 UI/UX

- Polished inline panel interaction and node hover behavior so media panels block pointer leakage correctly and selected nodes can still expose anchor hover targets for faster linking.

### 🐛 Bug Fixes

- Fixed image and video panel variant labels that still depended on removed preference metadata from older SDK payloads.
- Fixed lip-sync input wiring to use video plus audio instead of the outdated person-image flow.
- Fixed media task polling and chat image task handling to accept the newer SDK response shape, including text results returned by audio/STT tasks.

### 📦 Dependencies

- Upgraded `@openloaf-saas/sdk` from `0.1.18` to `0.1.21` in server, web, and shared API packages.
