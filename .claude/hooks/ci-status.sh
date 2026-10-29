#!/usr/bin/env bash
# UserPromptSubmit hook: tell Claude when the latest GitHub Actions run on the current branch failed or is still
# running. This covers pushes made outside Claude. Silent when CI is green, or when gh/the network is unavailable.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || exit 0
runs="$(gh run list --branch "$branch" --limit 1 --json databaseId,status,conclusion,headSha,displayTitle,url 2>/dev/null)" || exit 0
[[ "$(jq 'length' <<<"$runs")" == "0" ]] && exit 0

run="$(jq -r '.[0].databaseId' <<<"$runs")"
status="$(jq -r '.[0].status' <<<"$runs")"
conclusion="$(jq -r '.[0].conclusion' <<<"$runs")"
sha="$(jq -r '.[0].headSha' <<<"$runs")"
title="$(jq -r '.[0].displayTitle' <<<"$runs")"
url="$(jq -r '.[0].url' <<<"$runs")"
label="${sha:0:7} \"$title\" (run $run, $url)"

if [[ "$status" != "completed" ]]; then
  msg="CI is still running for $label."
elif [[ "$conclusion" != "success" && "$conclusion" != "skipped" && "$conclusion" != "neutral" ]]; then
  steps="$(gh run view "$run" --json jobs --jq '.jobs[] | .steps[] | select(.conclusion == "failure") | .name' 2>/dev/null | paste -sd ';' -)"
  msg="CI $conclusion on $branch for $label.${steps:+ Failed step(s): $steps.} Details: gh run view $run --log-failed"
else
  exit 0
fi

jq -n --arg ctx "[CI status, from the ci-status hook] $msg" \
  '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: $ctx}}'
