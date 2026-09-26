package domain

import (
	"errors"
	"fmt"
)

// 種別を表す共通エラー。handler が HTTP ステータスへ対応づける。
var (
	ErrNotFound     = errors.New("not found")
	ErrForbidden    = errors.New("forbidden")
	ErrUnauthorized = errors.New("unauthorized")
	ErrConflict     = errors.New("conflict")
)

// ErrLastOwner は、プロジェクトの最後の owner を降格・削除しようとしたときのエラー。
var ErrLastOwner = fmt.Errorf("%w: the last owner cannot be demoted or removed", ErrConflict)

// ValidationError は入力値の検証エラー。
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

// Invalid は ValidationError を返す。
func Invalid(format string, args ...any) error {
	return &ValidationError{Message: fmt.Sprintf(format, args...)}
}
