## PR #<N> レビュー対応方針

未解決スレッド: <X> 件(fix <a> / design <b> / question <c> / skip <d>)

### fix(承認で一括実装)

| # | 場所 | 指摘要約 | 対応 | コミット |
|---|---|---|---|---|
| F1 | frontend/src/features/projects/ProjectDetail.tsx:42 | 削除後に一覧が古いまま | `invalidateQueries` を追加 + テスト | fix: ... |

### design(選択が必要)

#### D1: backend/internal/service/project.go:10 「権限チェックが handler に漏れている」

- 案 A: service に移す(推奨)— 既存の TaskService と同型。変更 3 ファイル
- 案 B: handler のまま共通化 — 変更は小さいが、`docs/spec/requirements.md` の「最終判定は service」に反する
- 推奨: A。理由: ...

### question(返信のみ・resolve しない)

| # | 場所 | 返信文案 |
|---|---|---|
| Q1 | ... | ... |

### skip

| # | 場所 | 理由 |
|---|---|---|
| S1 | ... | <commit sha> で対応済み |

→ fix を進めてよいか、design は案 A / B のどちらにするか、question の返信文案でよいかを教えてください。
