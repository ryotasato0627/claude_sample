---
name: pr-review
description: Review Pull Requests according to project development rules, coding standards, architecture, testing requirements, and documented review guidelines.
---

# PR Review Skill

## Purpose

Pull Requestの変更内容をレビューし、プロジェクトのルール・設計・品質基準に対する問題を検出する。

## Required Context

レビュー開始前に、以下を確認する。

```text
CLAUDE.md                               # 共通ルール
.claude/rules/                          # 変更対象に対応するルール
docs/spec/requirements.md               # 要件・権限マトリクス・API の共通規約・アーキテクチャ
api/openapi.yaml                        # API 仕様
docs/development/branching-strategy.md
docs/development/pull-request.md
```

ファイルが存在しない場合は、そのルールについて推測しない。

## Review Process

### 1. Pull Request Context

以下を確認する。PR が無い場合は `git diff` で対象差分を特定する。

* PR title / description
* source / target branch
* changed files
* related Issue
* CI result

### 2. Branch Review

`branching-strategy.md` に従って、以下を確認する。

* branch naming
* source / target の組み合わせ(Git Flow 上の許可された遷移)
* `main` / `develop` への直接 push が無いか
* `release/*` に新機能が混入していないか

### 3. Change Review

以下の優先順位で確認する。

1. Correctness
2. Security(認証・認可・入力検証)
3. Data integrity
4. Architecture(`.claude/rules/` のルール)
5. Error handling
6. Test coverage
7. Maintainability / Readability
8. Performance

### 4. Project Rules

`CLAUDE.md`・`.claude/rules/`・`docs/` に定義されたプロジェクト固有ルールを優先する。

一般的なベストプラクティスとプロジェクトルールが異なる場合は、プロジェクトルールを根拠として指摘する。

### 5. Avoid False Positives

以下の場合、問題として断定せず `[Question]` として確認する。

* コードだけでは意図を判断できない。
* プロジェクト固有の仕様が不明。
* 実行結果を確認できない。
* 一般論だけを根拠とする問題。

## Severity

* **Blocking**: マージ前に対応が必要(バグ、セキュリティ問題、データ破壊、明確な仕様違反、依存方向・権限マトリクスの違反、必須テストの欠落)
* **Non-blocking**: 改善を推奨するが、マージを妨げない(可読性、保守性、命名、軽微な設計改善、リファクタリング候補)
* **Question**: 実装意図や仕様の確認

## Output

```markdown
## Summary
<レビュー概要>

## Blocking
- [file:line]
  <問題>
  <理由(根拠となる仕様・ルール)>
  <対応案>

## Non-blocking
- [file:line]
  <改善提案>
  <理由>

## Questions
- [file:line]
  <確認事項>

## Positive
- <良かった点>
```

問題がない場合は、無理に指摘を作らない。

## Important Rules

* コードを変更しない。
* ユーザーの明示的な依頼なしにPRをApprove / Mergeしない。
* 一般論だけでBlocking判定しない。
* プロジェクトドキュメントを確認せずにルール違反を断定しない。
