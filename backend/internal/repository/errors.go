package repository

import (
	"database/sql"
	"errors"

	"github.com/jackc/pgx/v5/pgconn"

	"taskapp/backend/internal/domain"
)

// PostgreSQL のエラーコード。
const (
	pgForeignKeyViolation = "23503"
	pgUniqueViolation     = "23505"
)

// mapErr は DB のエラーを domain の共通エラーへ変換する。
// 想定外のエラーはそのまま返す(handler では 500 になる)。
func mapErr(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return domain.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgUniqueViolation:
			return domain.ErrConflict
		case pgForeignKeyViolation:
			// 参照先(プロジェクト・Task・ユーザー)が存在しない
			return domain.ErrNotFound
		}
	}
	return err
}

// requireAffected は、更新・削除が 1 行以上に効いたことを確認する。0 行なら ErrNotFound。
func requireAffected(n int64, err error) error {
	if err != nil {
		return mapErr(err)
	}
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}
