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
