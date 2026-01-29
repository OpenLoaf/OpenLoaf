import assert from "node:assert/strict";

import { filterFilePickerEntries } from "../filter-file-picker-entries";

type FileSystemEntry = {
  uri: string;
  name: string;
  kind: "file" | "folder";
  ext?: string;
};

const entries: FileSystemEntry[] = [
  { uri: "boards/tnboard_current", name: "tnboard_current", kind: "folder" },
  { uri: "boards/tnboard_other", name: "tnboard_other", kind: "folder" },
  {
    uri: "boards/tnboard_current/index.tnboard",
    name: "index.tnboard",
    kind: "file",
    ext: "tnboard",
  },
  {
    uri: "boards/tnboard_other/index.tnboard",
    name: "index.tnboard",
    kind: "file",
    ext: "tnboard",
  },
  { uri: "boards/photo.png", name: "photo.png", kind: "file", ext: "png" },
];

const allowedExtensions = new Set(["png"]);

{
  const filtered = filterFilePickerEntries(entries, {
    allowedExtensions,
    excludeBoardEntries: true,
    currentBoardFolderUri: "boards/tnboard_current",
    currentDirectoryUri: "boards",
  });
  const names = filtered.map((entry) => entry.name);
  assert.equal(names.includes("tnboard_current"), false);
  assert.equal(names.includes("tnboard_other"), true);
  assert.equal(names.includes("photo.png"), true);
}

{
  const filtered = filterFilePickerEntries(entries, {
    allowedExtensions,
    excludeBoardEntries: false,
  });
  const names = filtered.map((entry) => entry.name);
  assert.equal(names.includes("tnboard_current"), true);
}

{
  const filtered = filterFilePickerEntries(entries, {
    excludeBoardEntries: true,
    currentBoardFolderUri: "boards/tnboard_current",
    currentDirectoryUri: "boards/tnboard_current",
  });
  const uris = filtered.map((entry) => entry.uri);
  assert.equal(uris.includes("boards/tnboard_current/index.tnboard"), false);
  assert.equal(uris.includes("boards/tnboard_other/index.tnboard"), true);
}

console.log("filterFilePickerEntries tests passed.");
