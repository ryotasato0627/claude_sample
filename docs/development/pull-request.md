# Pull Request Guidelines

## Purpose

Pull Request（PR）は、コード変更のレビュー、品質確認、変更理由の共有を目的とする。

## Required Information

PRには以下を記載する。

* 変更の目的
* 変更内容
* 関連Issue
* テスト内容
* 影響範囲
* 注意事項

## PR Title

以下の形式を基本とする。

```text
<type>: <summary>
```

例:

```text
feat: add user search API
fix: resolve login validation error
refactor: simplify user repository
```

## PR Granularity

### 原則: 1 PR = 1 機能

1つのPRには、利用者(画面の利用者、またはAPIの利用者)から見て完結した機能を1つだけ含める。

* PR単体でマージしても、ビルドとテストが通り、既存の機能を壊さない。
* PR単体で、要件(`docs/spec/requirements.md`)と照らして動作を確認できる。
* レイヤー(OpenAPI → domain → service → repository → handler など)の区切りは、PRではなくコミットで表現する(`.claude/skills/commit-strategy/SKILL.md`)。

### サイズの目安

変更行数(追加 + 削除)は **400行程度** を目安とする。

以下は数えない。

* 生成ファイル(`*.gen.go`、`*.gen.ts`、`sqlcgen/`)
* lock ファイル(`package-lock.json`、`go.sum`)

テストコードは数える。

```bash
git diff --shortstat develop...HEAD -- . \
  ':(exclude)*.gen.go' ':(exclude)*.gen.ts' ':(exclude)**/sqlcgen/**' \
  ':(exclude)**/package-lock.json' ':(exclude)**/go.sum'
```

目安を超える場合は、分割を検討する。分割しない場合は、PR本文の「備考」にその理由を書く。

### 分割の基準

* 機能が大きい場合は、単体で動作を確認できる単位に分ける(例: 一覧 → 作成 → 編集・削除)。
* 以下は、機能のPRとは別のPRにする。
  * 機能と無関係なリファクタリング
  * 既存の依存ライブラリの更新
  * CI・開発環境の設定変更
* 機能に付随する変更(その機能のテスト、要件ドキュメントの実装状況の更新など)は、同じPRに含める。
* 単独では使われない変更(例: ルーティングや認証状態の管理といった共通部品、依存ライブラリの追加)だけのPRは作らない。それを最初に使う機能と同じPRにする。

### 依存するPR

* 1 PR = 1 `feature/*` ブランチとする。
* 前のPRに依存する場合は、前のPRが `develop` にマージされてから、次のブランチを `develop` から作成する。
* 依存関係がある場合は、PR本文の「備考」に依存先のPRを書く。

## Review Requirements

PRは以下を満たしてからマージする。

* CIが成功している
* 必要なレビューが完了している
* テストが実施されている
* 指摘事項が解決または合意されている
* ブランチ戦略に違反していない

## Review Comment Priority

レビューコメントは以下の基準で分類する。

### Blocking

マージ前に修正が必要。

例:

* 明確なバグ
* セキュリティ上の問題
* データ破壊につながる問題
* プロジェクトルールへの重大な違反

### Non-blocking

修正が望ましいが、マージを妨げない。

例:

* 可読性
* 保守性
* 軽微な設計改善
* 命名改善

### Question

意図を確認するための質問。

実装が誤っていると断定せず、意図が不明な場合に使用する。

## Agent Behavior

Agentはレビュー時に以下を行う。

1. PRの変更内容を確認する。
2. 関連するIssue・仕様を確認する。
3. `branching-strategy.md` を確認する。
4. 本ドキュメントを確認する。
5. 必要なReview Skillを読み込む。
6. コードをレビューする。
7. 指摘をPriorityごとに分類する。
8. 根拠となるコードやルールを示す。
9. 推測だけで問題を指摘しない。

## Review Comment Format

Blocking:

```text
[Blocking]

問題:
<問題の説明>

理由:
<なぜ問題なのか>

対応案:
<推奨する対応>
```

Non-blocking:

```text
[Non-blocking]

<改善提案>

理由:
<理由>
```

Question:

```text
[Question]

<確認したい内容>
```
