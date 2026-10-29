#!/usr/bin/env bash
# PostToolUse hook (async, wakes Claude): after Claude runs `git push`, wait for the GitHub Actions run of the pushed
# commit (HEAD) and report its result. Exit 2 wakes Claude with stderr as the message; exit 0 stays silent.
set -uo pipefail

input="$(cat)"
cmd="$(jq -r '.tool_input.command // ""' <<<"$input")"
# `git push` as a command of its own: at the start, or after ; & | ( (not e.g. inside `echo git push`).
push_re='(^|[;&|(])[[:space:]]*git[[:space:]]+push([[:space:]]|$)'
[[ "$cmd" =~ $push_re ]] || exit 0
[[ "$cmd" == *--dry-run* ]] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
sha="$(git rev-parse HEAD 2>/dev/null)" || exit 0
short="${sha:0:7}"

# The run is registered a few seconds after the push arrives.
run=""
for _ in $(seq 1 30); do
  run="$(gh run list --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null)"
  [[ -n "$run" ]] && break
  sleep 4
done
if [[ -z "$run" ]]; then
  echo "CI: no GitHub Actions run appeared for $short within 2 minutes of the push. Check that the push succeeded and that the workflow triggers on this branch." >&2
  exit 2
fi

gh run watch "$run" --interval 15 >/dev/null 2>&1
info="$(gh run view "$run" --json conclusion,url,displayTitle,jobs 2>/dev/null)" || {
  echo "CI: could not read the result of run $run for $short." >&2
  exit 2
}
conclusion="$(jq -r '.conclusion' <<<"$info")"
url="$(jq -r '.url' <<<"$info")"
title="$(jq -r '.displayTitle' <<<"$info")"

if [[ "$conclusion" == "success" ]]; then
  echo "CI passed for $short \"$title\" (run $run, $url)." >&2
  exit 2
fi

failed="$(jq -r '.jobs[] | select(.conclusion != "success" and .conclusion != "skipped") | "- job \(.name): \(.conclusion)", (.steps[] | select(.conclusion == "failure") | "  - step failed: \(.name)")' <<<"$info")"
{
  echo "CI $conclusion for $short \"$title\" (run $run, $url)."
  echo "$failed"
  echo "Last lines of the failing log (full: gh run view $run --log-failed; Playwright report: gh run download $run -n playwright-report):"
  gh run view "$run" --log-failed 2>/dev/null | tail -n 60
} >&2
exit 2
