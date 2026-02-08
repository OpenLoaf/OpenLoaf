import assert from "node:assert/strict";

import {
  compareVersions,
  gateBetaManifest,
  isRemoteNewer,
  shouldUseBundled,
} from "../incrementalUpdatePolicy.ts";

const stableManifest = {
  schemaVersion: 1,
  server: { version: "1.1.0" },
  web: { version: "1.1.0" },
};

{
  const betaMissing = { schemaVersion: 1 };
  const result = gateBetaManifest({ beta: betaMissing, stable: stableManifest });
  assert.equal(result.skipped, true);
  assert.equal(result.manifest.server, undefined);
  assert.equal(result.manifest.web, undefined);
}

{
  const betaOlder = {
    schemaVersion: 1,
    server: { version: "1.0.0" },
    web: { version: "1.1.0" },
  };
  const result = gateBetaManifest({ beta: betaOlder, stable: stableManifest });
  assert.equal(result.skipped, true);
  assert.equal(result.manifest.server, undefined);
  assert.equal(result.manifest.web, undefined);
}

{
  const betaNewer = {
    schemaVersion: 1,
    server: { version: "1.2.0" },
    web: { version: "1.1.1" },
  };
  const result = gateBetaManifest({ beta: betaNewer, stable: stableManifest });
  assert.equal(result.skipped, false);
  assert.equal(result.manifest.server?.version, "1.2.0");
  assert.equal(result.manifest.web?.version, "1.1.1");
}

console.log("incremental update beta policy tests passed.");

{
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.1", "1.0.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.1"), 1);
}

{
  assert.equal(isRemoteNewer("1.0.0", "1.0.0"), false);
  assert.equal(isRemoteNewer("1.0.0", "1.0.1"), true);
  assert.equal(isRemoteNewer("1.0.1", "1.0.0"), false);
  assert.equal(isRemoteNewer(undefined, "1.0.0"), true);
  assert.equal(isRemoteNewer("1.0.0", undefined), false);
}

{
  assert.equal(shouldUseBundled("1.3.0", "1.2.0"), true);
  assert.equal(shouldUseBundled("1.2.0", "1.2.0"), false);
  assert.equal(shouldUseBundled("1.1.0", "1.2.0"), false);
  assert.equal(shouldUseBundled("1.0.0", "1.0.0-beta.1"), true);
  assert.equal(shouldUseBundled(undefined, "1.2.0"), false);
  assert.equal(shouldUseBundled("1.2.0", undefined), false);
}
