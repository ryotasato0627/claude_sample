---
name: address-pr
description: PR のレビューコメント(未解決スレッド)を読み、分類 → 方針提示(承認待ち) → 修正・コミット → 検証 → push → 返信・resolve まで行う。引数は PR 番号。「レビュー対応して」「PR のコメント見て」と言われたら使う。
---

# PR レビュー対応

作業系の指摘はさっさと直し、設計系の指摘は止まって合意を取る。そのために **フェーズ 3 で必ず停止する**。

引数: PR 番号(省略時は `gh pr view --json number -q .number` で現在ブランチの PR を使う)

## Required Context

```text
CLAUDE.md
docs/development/branching-strategy.md
docs/development/pull-request.md     # レビューコメントの分類(Blocking / Non-blocking / Question)
.claude/skills/commit-strategy/SKILL.md
.claude/rules/                       # 修正対象のファイルに対応するルール
```

## フェーズ 0: 前提チェック(失敗したら止まって報告)

- `gh auth status` が成功すること
- `gh pr view <N> --json headRefName,baseRefName,state` で、PR が OPEN であること
- `headRefName` と `git branch --show-current` が一致すること
- 現在のブランチが `main` / `develop` でないこと
- `git status --porcelain` が空であること(未コミットの変更があれば stash せず報告)
- `git fetch` 後、ローカルがリモートより遅れていないこと(遅れていれば報告)

## フェーズ 1: 収集

- `bash .claude/skills/address-pr/scripts/fetch-threads.sh <N>` で未解決スレッドを JSON で取得する。
  各スレッドは `id` / `path` / `line` / `outdated` / `comments[]` を持つ。
- PR 本文への会話コメント(スレッドに紐づかないもの)とレビュー本文は、次のコマンドで読む。

  ```bash
  gh pr view <N> --json comments,reviews \
    -q '{comments: [.comments[] | {author: .author.login, body}], reviews: [.reviews[] | {author: .author.login, state, body}]}'
  ```

  `gh pr view <N> --comments` は使わない(gh 2.45 では廃止された Projects (classic) を参照してエラーになる)。
- 指摘されたコードを実際に読み、指摘が現在のコードに当てはまるかを確認する。

## フェーズ 2: 分類

各スレッドを次の 4 つに分ける。**迷ったら design に倒す。**

| 分類 | 基準 | 扱い |
|---|---|---|
| fix | 命名、typo、テスト追加、null チェック、lint、既存パターンへの統一など、設計を変えない修正 | 承認後に実装 |
| design | 責務分割、API・型の形、依存の向き、エラー方針、データモデル、「なぜこうした?」を含むもの | 実装せず選択肢を提示 |
| question | 説明を求めているだけで変更要求がない | 返信文案のみ作成 |
| skip | 既に別コミットで対応済み、または指摘箇所が消えている | 理由を添えて報告 |

このプロジェクト固有の基準:

- 次のいずれかを変更する指摘は、内容が小さくても **design** にする。
  - `api/openapi.yaml`(API 仕様)
  - `docs/spec/requirements.md` の権限マトリクス・データモデル・API の共通規約
  - マイグレーション(`backend/` のスキーマ)
  - Backend のレイヤー間の依存の向き
- コメントの先頭の `[Blocking]` / `[Non-blocking]` / `[Question]`(`docs/development/pull-request.md`)は優先度であって分類ではない。`[Question]` は原則 question、それ以外は内容で fix / design を判断する。
- 指摘が要件や OpenAPI と矛盾する場合は、指摘に従わず design として矛盾を提示する。

## フェーズ 3: 方針提示 ★必ず停止

`templates/plan.md` の形式で出力し、ユーザーの承認を待つ。

- fix: 変更内容を 1 行で
- design: 選択肢を 2〜3 個、トレードオフ、推奨とその理由。**コードは書かない**
- question: 返信文案
- skip: 理由

ユーザーが「進めて」と言うまでフェーズ 4 に進まない。
design の項目は、ユーザーが選択肢を選ぶまで実装しない。選ばれなかった design は未対応として残す。

## フェーズ 4: 実装

`commit-strategy` Skill のルールに従う。

- fix は原則 1 スレッド = 1 コミット。関連する指摘はまとめてよい。
- design はユーザーの決定どおりに実装し、コミット本文に決定内容と理由を書く。
- コミットメッセージは `<type>: <要約>`(type は変更内容に合わせて feat / fix / refactor / test / docs / chore)。本文に PR 番号と対応したスレッド ID をすべて書く。

  ```text
  fix: プロジェクト削除後に一覧のキャッシュを無効化する

  PR #42 のレビュー指摘への対応。
  Thread: PRRT_xxxxxxxx
  ```

- 生成物は手で編集しない。OpenAPI / SQL を直して `make generate` する。
- 承認された範囲以外の変更(ついでのリファクタリングなど)をしない。

## フェーズ 5: 検証

```bash
make lint
make test
```

失敗したら push せずに報告する。実行できなかった場合は、成功と報告せず理由を書く。

## フェーズ 6: push・返信・resolve

1. `git push`(PR のブランチへ。force push しない)
2. 各スレッドに返信する。

   ```bash
   bash .claude/skills/address-pr/scripts/reply-resolve.sh <thread_id> "<本文>" [true|false]
   ```

   | 分類 | 本文 | resolve |
   |---|---|---|
   | fix | 「対応しました: <commit sha>」と変更の要約 | true |
   | design(決定済み) | 「<選んだ案> で対応しました: <commit sha>。理由: ...」 | true |
   | design(未決定) | 返信しない | - |
   | question | 承認された回答文 | **false**(質問者が resolve する) |
   | skip | 対応済みのコミット、または指摘箇所が消えた理由 | true |

3. 最後に対応サマリを出す。
   - スレッド数(分類ごと)
   - コミット一覧(sha とメッセージ)
   - lint / test の結果
   - 未対応のスレッドとその理由

design で決めた内容が要件や API 仕様に関わる場合は、`docs/spec/requirements.md` / `api/openapi.yaml` の更新も同じ PR に含める(フェーズ 3 の方針に含めて承認を取る)。

## やってはいけないこと

- フェーズ 3 の承認なしにコードを変更する
- design に分類した指摘を独断で実装する
- force push、PR のブランチ以外への push、`main` / `develop` への直接コミット
- 返信せずにスレッドを resolve する
- question のスレッドを resolve する
- lint / test が失敗した状態で push する
