#!/bin/sh
cd "$(dirname "$0")" || exit 1
exam_node=$(command -v node)
if [ -z "$exam_node" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
    if [ -x "$candidate" ]; then exam_node="$candidate"; break; fi
  done
fi
if [ -z "$exam_node" ]; then
  printf '%s\n' 'Node.js 24를 설치한 뒤 다시 실행해주세요.'
  read -r answer
  exit 1
fi
"$exam_node" scripts/start-rhwp-exam.cjs
if [ "$?" -ne 0 ]; then read -r answer; exit 1; fi
