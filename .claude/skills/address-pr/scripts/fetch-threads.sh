#!/usr/bin/env bash
# PR の未解決レビュースレッドを JSON で出力する。
# REST の pulls/N/comments ではスレッドのまとまりと resolved 状態が取れないため GraphQL を使う。
# 使い方: fetch-threads.sh <PR番号>
set -euo pipefail

PR="${1:?PR number required}"
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)

# スレッドは最大 100 件、各スレッドのコメントは最大 50 件まで取得する。
gh api graphql \
  -f owner="$OWNER" -f repo="$REPO" -F pr="$PR" \
  -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        totalCount
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          originalLine
          comments(first: 50) {
            nodes { author { login } body createdAt url }
          }
        }
      }
    }
  }
}' \
  --jq '.data.repository.pullRequest.reviewThreads
        | {
            total: .totalCount,
            unresolved: [
              .nodes[]
              | select(.isResolved == false)
              | {
                  id,
                  path,
                  line: (.line // .originalLine),
                  outdated: .isOutdated,
                  comments: [.comments.nodes[] | {author: .author.login, body, createdAt, url}]
                }
            ]
          }'
