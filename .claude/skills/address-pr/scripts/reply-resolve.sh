#!/usr/bin/env bash
# レビュースレッドに返信し、必要なら resolve する。
# 使い方: reply-resolve.sh <thread_id> <本文> [true|false]
#   第 3 引数が true(既定)のときだけ resolve する。question への回答は false を渡す。
set -euo pipefail

THREAD="${1:?thread id required}"
BODY="${2:?body required}"
RESOLVE="${3:-true}"

# 本文は -f(文字列)で渡す。-F だと "@..." がファイル読み込み、数値や true が型変換される。
gh api graphql \
  -f t="$THREAD" -f b="$BODY" \
  -f query='
mutation($t: ID!, $b: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $t, body: $b}) {
    comment { url }
  }
}' \
  --jq '.data.addPullRequestReviewThreadReply.comment.url'

if [ "$RESOLVE" = "true" ]; then
  gh api graphql \
    -f t="$THREAD" \
    -f query='
mutation($t: ID!) {
  resolveReviewThread(input: {threadId: $t}) { thread { isResolved } }
}' \
    --jq '"resolved: \(.data.resolveReviewThread.thread.isResolved)"'
fi
