---
paths:
  - "backend/**/*_test.go"
---

# Backend のテスト

- 標準の `testing` を使い、テーブル駆動テスト(`t.Run`)を基本とする。既存テストの命名・ヘルパー(`internal/testutil`)・fake の置き場所に従う。
- **`service`**: port の fake / stub を注入し、DB なしでテストする。時刻などの外部要素も fake を使う。
- **`repository`**: 実 DB(compose の `db`)でテストする。テストごとにデータを分離する(`internal/testutil/pgtest`)。
- **`handler`**: `httptest` で HTTP レベルを検証する(未認証・不正入力・権限不足のステータスコードと正常系)。

## 権限のテスト

権限マトリクス(`docs/spec/requirements.md` 第2章)の **操作 × ロール** をすべて検証する。

- 操作ごとに Owner / Member / Viewer / 非メンバー / 未認証の結果(成功・403・404・401)
- コメントの編集・削除: Owner は全件、Member は自分のもののみ、Viewer は不可
- 他プロジェクトの Task・コメントを ID 指定で操作できないこと
- 担当者に指定できるのは、そのプロジェクトのメンバーのみ
- 最後の Owner を降格・削除できないこと
- Task 検索が、自分が所属するプロジェクトの Task のみを返すこと

## 書き方

- 仕様から導いたケースを書く。実装をなぞるだけのテスト(実装と同じ計算を期待値にする等)を書かない。
- 実装が仕様と食い違う場合、テストを実装に合わせて曲げない。
- 外部への通信や、実行順序・時刻に依存する不安定なテストを書かない。

```bash
docker compose run --rm backend go test ./...
```
