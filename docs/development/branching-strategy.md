# Branching Strategy

## Overview

本プロジェクトでは Git Flow を採用する。

ブランチは以下の役割で運用する。

| Branch       | Purpose       | Base      | Merge Target      |
| -----------  | ------------- | --------- | ----------------- |
| `main`       | 本番リリース済みコード   | -         | -                 |
| `develop`    | 次回リリースの統合ブランチ | `main`    | -                 |
| `feature/*`  | 新機能・機能変更      | `develop` | `develop`         |
| `release/*`  | リリース準備        | `develop` | `main`, `develop` |
| `docs/*`     | ドキュメント更新     | `develop` | `develop`, `main` |
| `refactor/*` | リファクタリング    | `develop` | `develop` |
| `hotfix/*`   | 本番障害など緊急修正    | `main`    | `main`, `develop` |

## Branch Rules

### main

* 常に本番リリース可能な状態を維持する。
* `main` への直接pushは禁止する。
* 原則として `release/*` または `hotfix/*` からPull Requestでマージする。
* マージ前にCIが成功していること。

### develop

* 次回リリース対象の変更を統合する。
* `develop` への直接pushは禁止する。
* 原則として `feature/*` または `release/*` からPull Requestでマージする。

### feature/*

新機能、機能変更、通常のバグ修正に使用する。

命名規則:

```text
feature/<issue-number>-<short-description>
```

例:

```text
feature/123-add-user-search
feature/456-fix-login-validation
```

`feature/*` は `develop` から作成する。

```bash
git switch develop
git pull
git switch -c feature/123-add-user-search
```

作業完了後、`develop` をマージ先としてPull Requestを作成する。

### release/*

リリース準備に使用する。

命名規則:

```text
release/<version>
```

例:

```text
release/1.4.0
```

`release/*` は `develop` から作成する。

releaseブランチでは原則として以下のみを行う。

* バージョン更新
* リリース設定変更
* リリース前のバグ修正
* ドキュメント更新

新機能の追加は禁止する。

リリース完了後、`main` と `develop` の両方へ変更を反映する。

### hotfix/*

本番環境の緊急修正に使用する。

命名規則:

```text
hotfix/<issue-number>-<short-description>
```

例:

```text
hotfix/789-fix-payment-error
```

`hotfix/*` は `main` から作成する。

修正完了後、`main` と `develop` の両方へ変更を反映する。

## Merge Rules

| Source      | Target    | Purpose   |
| ----------- | --------- | --------- |
| `feature/*` | `develop` | 通常開発      |
| `release/*` | `main`    | リリース      |
| `release/*` | `develop` | リリース変更の反映 |
| `hotfix/*`  | `main`    | 緊急修正      |
| `hotfix/*`  | `develop` | 緊急修正の反映   |

## Prohibited Operations

以下は禁止する。

* `main` への直接push
* `develop` への直接push
* `feature/*` から `main` への直接マージ
* `feature/*` から `release/*` への直接マージ
* Pull Requestを経由しない本番変更
* レビュー前のマージ

## Agent Review Points

PRレビュー時は以下を確認する。

1. ブランチの種類が命名規則に従っているか。
2. source / target branch の組み合わせが正しいか。
3. `main` / `develop` への直接pushが発生していないか。
4. `release/*` に新機能が混入していないか。
5. `hotfix/*` が `main` 以外から作成されていないか。
6. `release/*` / `hotfix/*` の変更が `develop` に反映される設計になっているか。
