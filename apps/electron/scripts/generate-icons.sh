#!/usr/bin/env bash
set -euo pipefail

# 输入 SVG 路径（默认使用 apps/web/public/logo.svg）。
INPUT_SVG=""
# 输出目录（默认使用 apps/electron/resources）。
OUTPUT_DIR=""
# 是否保留 icon.iconset 目录。
KEEP_ICONSET="true"

# Print usage for this script.
usage() {
  cat <<'EOF'
Usage: apps/electron/scripts/generate-icons.sh [options]

Options:
  -i, --input <path>    Input SVG path (default: apps/web/public/logo.svg)
  -o, --output <path>   Output directory (default: apps/electron/resources)
  --clean               Remove icon.iconset after generating icons
  -h, --help            Show this help
EOF
}

# Ensure required commands are available.
require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing dependency: $cmd" >&2
    exit 1
  fi
}

# Render a square PNG using rsvg-convert.
render_png() {
  local size="$1"
  local output="$2"
  rsvg-convert -w "$size" -h "$size" -o "$output" "$INPUT_SVG"
}

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"

INPUT_SVG="${REPO_ROOT}/apps/web/public/logo.svg"
OUTPUT_DIR="${REPO_ROOT}/apps/electron/resources"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)
      INPUT_SVG="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --clean)
      KEEP_ICONSET="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd "rsvg-convert"
require_cmd "iconutil"
require_cmd "magick"

if [[ ! -f "$INPUT_SVG" ]]; then
  echo "Input SVG not found: $INPUT_SVG" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

ICONSET_DIR="${OUTPUT_DIR}/icon.iconset"
ICON_ICNS="${OUTPUT_DIR}/icon.icns"
ICON_ICO="${OUTPUT_DIR}/icon.ico"
ICON_PNG="${OUTPUT_DIR}/icon.png"

rm -rf "$ICONSET_DIR"
rm -f "$ICON_ICNS" "$ICON_ICO" "$ICON_PNG"
mkdir -p "$ICONSET_DIR"

# 中文注释：按 macOS iconset 规范生成 10 份 PNG，确保透明通道正确。
render_png 16 "${ICONSET_DIR}/icon_16x16.png"
render_png 32 "${ICONSET_DIR}/icon_16x16@2x.png"
render_png 32 "${ICONSET_DIR}/icon_32x32.png"
render_png 64 "${ICONSET_DIR}/icon_32x32@2x.png"
render_png 128 "${ICONSET_DIR}/icon_128x128.png"
render_png 256 "${ICONSET_DIR}/icon_128x128@2x.png"
render_png 256 "${ICONSET_DIR}/icon_256x256.png"
render_png 512 "${ICONSET_DIR}/icon_256x256@2x.png"
render_png 512 "${ICONSET_DIR}/icon_512x512.png"
render_png 1024 "${ICONSET_DIR}/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS"
render_png 512 "$ICON_PNG"

ICNS_ICONSET_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR" "$ICNS_ICONSET_DIR"' EXIT

iconutil -c iconset "$ICON_ICNS" -o "${ICNS_ICONSET_DIR}/icon.iconset"

EXPECTED_ICNS_FILES=(
  "icon_16x16.png"
  "icon_16x16@2x.png"
  "icon_32x32.png"
  "icon_32x32@2x.png"
  "icon_128x128.png"
  "icon_128x128@2x.png"
  "icon_256x256.png"
  "icon_256x256@2x.png"
  "icon_512x512.png"
  "icon_512x512@2x.png"
)

for filename in "${EXPECTED_ICNS_FILES[@]}"; do
  if [[ ! -f "${ICNS_ICONSET_DIR}/icon.iconset/${filename}" ]]; then
    echo "Invalid icns output, missing ${filename}" >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
render_png 16 "${TMP_DIR}/icon_16.png"
render_png 32 "${TMP_DIR}/icon_32.png"
render_png 48 "${TMP_DIR}/icon_48.png"
render_png 64 "${TMP_DIR}/icon_64.png"
render_png 128 "${TMP_DIR}/icon_128.png"
render_png 256 "${TMP_DIR}/icon_256.png"

magick \
  "${TMP_DIR}/icon_16.png" \
  "${TMP_DIR}/icon_32.png" \
  "${TMP_DIR}/icon_48.png" \
  "${TMP_DIR}/icon_64.png" \
  "${TMP_DIR}/icon_128.png" \
  "${TMP_DIR}/icon_256.png" \
  "$ICON_ICO"

if [[ "$KEEP_ICONSET" != "true" ]]; then
  rm -rf "$ICONSET_DIR"
fi

echo "Icons generated:"
echo "  $ICON_PNG"
echo "  $ICON_ICO"
echo "  $ICON_ICNS"
if [[ "$KEEP_ICONSET" == "true" ]]; then
  echo "  $ICONSET_DIR"
fi
