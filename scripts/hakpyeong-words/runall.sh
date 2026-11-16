#!/bin/bash
cd ~/Work/2026-11-09_학평-색인
while IFS=$'\t' read -r f p; do
  o="out/${f%.pdf}.json"; [ -s "$o" ] && continue
  printf '%s\t%s\0' "$o" "$p"
done < list.tsv | xargs -0 -n1 -P4 bash -c 'IFS=$'"'"'\t'"'"' read -r o p <<< "$0"; ./ocr "$p" "$o" || echo "실패 $o"'
echo 끝 $(ls out | wc -l)
