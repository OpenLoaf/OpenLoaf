#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_PATH="${ROOT_DIR}/resources/speech/macos/SpeechRecognizer.swift"
OUTPUT_PATH="${ROOT_DIR}/resources/speech/macos/tenas-speech"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skip speech helper build: macOS only."
  exit 0
fi

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun not found. Please install Xcode Command Line Tools." >&2
  exit 1
fi

if [[ ! -f "${SOURCE_PATH}" ]]; then
  echo "SpeechRecognizer.swift not found at ${SOURCE_PATH}" >&2
  exit 1
fi

xcrun swiftc \
  -framework Foundation \
  -framework Speech \
  -framework AVFoundation \
  "${SOURCE_PATH}" \
  -o "${OUTPUT_PATH}"

chmod +x "${OUTPUT_PATH}"
echo "Built speech helper: ${OUTPUT_PATH}"
