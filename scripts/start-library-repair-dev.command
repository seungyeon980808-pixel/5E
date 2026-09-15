#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
export FIVE_E_DEV_USER_DATA="$HOME/Library/Application Support/5E Development Check"
export FIVE_E_BUNDLED_PDF_PACK_SOURCE="$HOME/Applications/5E 크롭 미리보기 수정본.app/Contents/Resources/pdf-library/recent-three-pack"
exec ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
