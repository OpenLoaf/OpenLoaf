#!/usr/bin/env bash
set -euo pipefail

# 输入 SVG 路径（默认使用 apps/web/public/logo.svg）。
INPUT_SVG=""
# 输出目录（默认使用 apps/desktop/resources）。
OUTPUT_DIR=""
# 是否保留 icon.iconset 目录。
KEEP_ICONSET="true"
# PNG 输出留白比例（0-0.49），用于让无留白 SVG 生成合适的视觉尺寸。
PADDING_RATIO="0.1"
# 圆角比例（0-0.49），用于匹配 macOS 图标圆角规则。
CORNER_RATIO="0.2"

# Print usage for this script.
usage() {
  cat <<'EOF'
Usage: apps/desktop/scripts/generate-icons.sh [options]

Options:
  -i, --input <path>    Input SVG path (default: apps/web/public/logo.svg)
  -o, --output <path>   Output directory (default: apps/desktop/resources)
  --padding <ratio>     Add padding around SVG (default: 0.1)
  --corner <ratio>      Rounded corner ratio for PNG (default: 0.2)
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
  local tmp_input
  tmp_input="$(mktemp -t icon_tmp).png"
  if [[ "$PADDING_RATIO" == "0" || "$PADDING_RATIO" == "0.0" ]]; then
    rsvg-convert -w "$size" -h "$size" -o "$tmp_input" "$INPUT_SVG"
  else
    local inner_size
    inner_size=$(awk -v s="$size" -v p="$PADDING_RATIO" 'BEGIN { printf "%d", int(s * (1 - 2 * p) + 0.5) }')
    if [[ "$inner_size" -le 0 ]]; then
      echo "Invalid padding ratio: $PADDING_RATIO" >&2
      exit 1
    fi
    local tmp_file
    tmp_file="$(mktemp -t icon_tmp).png"
    rsvg-convert -w "$inner_size" -h "$inner_size" -o "$tmp_file" "$INPUT_SVG"
    magick "$tmp_file" -background none -gravity center -extent "${size}x${size}" "$tmp_input"
    rm -f "$tmp_file"
  fi
  if [[ "$CORNER_RATIO" == "0" || "$CORNER_RATIO" == "0.0" ]]; then
    magick "$tmp_input" -define png:color-type=6 "PNG32:$output"
    rm -f "$tmp_input"
    return
  fi
  # 中文注释：生成圆角蒙版并合成到 PNG，避免硬边角。
  local corner_radius
  corner_radius=$(awk -v s="$size" -v r="$CORNER_RATIO" 'BEGIN { printf "%d", int(s * r + 0.5) }')
  local mask_file
  mask_file="$(mktemp -t icon_tmp).png"
  magick -size "${size}x${size}" xc:none -fill white \
    -draw "roundrectangle 0,0 ${size},${size} ${corner_radius},${corner_radius}" \
    "png:$mask_file"
  magick "$tmp_input" -alpha on "$mask_file" -compose DstIn -composite \
    -define png:color-type=6 "PNG32:$output"
  rm -f "$tmp_input" "$mask_file"
}

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"

INPUT_SVG="${REPO_ROOT}/apps/web/public/logo.svg"
OUTPUT_DIR="${REPO_ROOT}/apps/desktop/resources"

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
    --padding)
      PADDING_RATIO="$2"
      shift 2
      ;;
    --corner)
      CORNER_RATIO="$2"
      shift 2
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
if ! awk -v p="$PADDING_RATIO" 'BEGIN { exit (p >= 0 && p < 0.5) ? 0 : 1 }'; then
  echo "Padding ratio must be >= 0 and < 0.5 (got: $PADDING_RATIO)" >&2
  exit 1
fi
if ! awk -v r="$CORNER_RATIO" 'BEGIN { exit (r >= 0 && r < 0.5) ? 0 : 1 }'; then
  echo "Corner ratio must be >= 0 and < 0.5 (got: $CORNER_RATIO)" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

ICONSET_DIR="${OUTPUT_DIR}/icon.iconset"
ICON_ICNS="${OUTPUT_DIR}/icon.icns"
ICON_ICO="${OUTPUT_DIR}/icon.ico"
ICON_PNG="${OUTPUT_DIR}/icon.png"

rm -rf "$ICONSET_DIR"
rm -f "$ICON_ICO" "$ICON_PNG"
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

ICON_ICNS_TMP="$(mktemp -t icon_icns_tmp).icns"
ICONUTIL_OK="false"
if iconutil -c icns "$ICONSET_DIR" -o "$ICON_ICNS_TMP"; then
  mv "$ICON_ICNS_TMP" "$ICON_ICNS"
  ICONUTIL_OK="true"
else
  # 中文注释：iconutil 失败时保留已有 icns，避免输出被清空。
  rm -f "$ICON_ICNS_TMP"
fi
render_png 512 "$ICON_PNG"

ICNS_ICONSET_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR" "$ICNS_ICONSET_DIR"' EXIT

if [[ "$ICONUTIL_OK" == "true" ]]; then
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
else
  echo "Warning: iconutil failed, skipped icns generation." >&2
fi

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
if [[ "$KEEP_ICONSET" == "true" ]]; then
  echo "  $ICONSET_DIR"
fi
if [[ -f "$ICON_ICNS" ]]; then
  echo "  $ICON_ICNS"
else
  echo "  (icon.icns not generated)"
fi
