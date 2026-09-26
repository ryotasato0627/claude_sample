---
name: pr-review
description: Review Pull Requests according to project development rules, coding standards, architecture, testing requirements, and documented review guidelines.
---

# PR Review Skill

## Purpose

Pull Requestの変更内容をレビューし、プロジェクトのルール・設計・品質基準に対する問題を検出する。

## Required Context

レビュー開始前に、以下のドキュメントを確認する。

```text
docs/development/branching-strategy.md
docs/development/pull-request.md
docs/development/coding-guidelines.md
```

ファイルが存在しない場合は、そのルールについて推測しない。

## Review Process

### 1. Pull Request Context

以下を確認する。

* PR title
* PR description
* source branch
* target branch
* changed files
* related Issue
* CI result

### 2. Branch Review

`branching-strategy.md` に従って、以下を確認する。

* branch naming
* source branch
* target branch
* Git Flow上の許可された遷移

ルール違反がある場合は指摘する。

### 3. Change Review

変更されたコードについて確認する。

* correctness
* security
* error handling
* test coverage
* maintainability
* readability
* architecture
* performance

### 4. Project Rules

`docs/` に定義されたプロジェクト固有ルールを優先する。

一般的なベストプラクティスとプロジェクトルールが異なる場合は、プロジェクトルールを根拠として指摘する。

### 5. Avoid False Positives

以下の場合、問題として断定しない。

* コードだけでは意図を判断できない。
* プロジェクト固有の仕様が不明。
* 実行結果を確認できない。
* 一般論だけを根拠とする問題。

必要な場合は `[Question]` として確認する。

## Severity

### Blocking

マージ前に対応が必要。

対象:

* バグ
* セキュリティ問題
* データ破壊
* 明確な仕様違反
* 重大なアーキテクチャ違反
* 必須テストの欠落

### Non-blocking

改善を推奨するが、マージを妨げない。

対象:

* 可読性
* 保守性
* 軽微な設計改善
* 命名
* リファクタリング候補

### Question

実装意図を確認する。

## Output

レビュー結果は以下の形式で整理する。

```text
## Summary

<レビュー概要>

## Blocking

- <指摘>

## Non-blocking

- <指摘>

## Questions

- <質問>

## Positive

- <良かった点>
```

指摘には可能な限り以下を含める。

* 対象ファイル
* 対象箇所
* 問題
* 根拠
* 対応案

## Important Rules

* コードを変更しない。
* ユーザーの明示的な依頼なしにPRをApproveしない。
* 問題がない場合、無理に指摘を作らない。
* 一般論だけでBlocking判定しない。
* プロジェクトドキュメントを確認せずにルール違反を断定しない。
