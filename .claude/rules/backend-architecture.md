---
paths:
  - "backend/**/*.go"
---

# Backend アーキテクチャ(依存性逆転)

`docs/spec/requirements.md` 第7.1章が正。依存は常に **外側 → 内側** に向け、具体実装ではなく抽象に依存する。

```text
cmd/server (composition root)
   ├─ handler ─────────▶ service ─────────▶ domain
   │                        ▲
   └─ repository/infra ─────┘  (service が定義した interface を実装する)
```

## 必ず守ること

1. **interface は使う側のパッケージで定義する。** `service` が必要とする `ProjectRepository` などは `service` に置き、`repository` がそれを満たす。`repository` 側に interface を置かない。
2. **`domain` は標準ライブラリにしか依存しない。** エンティティ、ロール、権限判定(Policy)のみ。
3. **`service` は具体実装を import しない。** 禁止: `repository` / `infra` / `handler` / gin / `database/sql` / pgx / `x/crypto` / jwt / sqlc の生成コード。
4. **`handler` は gin に閉じる。** `*gin.Context` を `handler` の外に渡さない。`handler` は `service` を import せず、自パッケージ(`deps.go`)の小さな interface に依存する。
5. **外部要素は port(interface)経由。** 時刻(Clock)、パスワードハッシュ、JWT、ID 生成など。`service` から `time.Now()` や bcrypt / jwt を直接呼ばない。
6. **組み立ては `cmd/server/app.go`(`newRouter`)だけで行う。** `init()`・パッケージレベルのグローバル変数・シングルトンで依存を持たない。
7. **コンストラクタで依存を受け取る。** interface を受け取り、具体的な struct を返す(`NewXxxService(repo ProjectRepository, ...)`)。
8. **sqlc の生成型を `repository` の外に出さない。** `repository` 内で `domain` のエンティティに変換して返す。
9. **権限チェックは `service`(domain の Policy)に集約する。** handler や repository に散在させない。
10. interface は小さく保つ。使わないメソッドを含めない。

依存方向は `golangci-lint` の `depguard`(`backend/.golangci.yml`)で検査し、CI で失敗させる。新しいパッケージを追加したら許可リストを更新する。

```bash
docker compose run --rm backend go vet ./...
docker compose run --rm backend golangci-lint run
```
