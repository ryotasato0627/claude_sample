package service

import (
	"net/mail"
	"strings"
	"unicode/utf8"

	"taskapp/backend/internal/domain"
)

const (
	maxNameLen        = 100
	maxProjectDescLen = 2000
	maxTaskTitleLen   = 200
	maxTaskDescLen    = 10000
	maxCommentLen     = 5000
	maxQueryLen       = 200

	minPasswordLen = 8
	maxPasswordLen = 72 // bcrypt の入力上限(バイト)
)

// requiredText は前後の空白を除いた文字列が 1〜max 文字であることを検証する。
func requiredText(field, s string, max int) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", domain.Invalid("%s is required", field)
	}
	if utf8.RuneCountInString(s) > max {
		return "", domain.Invalid("%s must be at most %d characters", field, max)
	}
	return s, nil
}

// optionalText は空でもよい文字列が max 文字以内であることを検証する。
func optionalText(field, s string, max int) (string, error) {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > max {
		return "", domain.Invalid("%s must be at most %d characters", field, max)
	}
	return s, nil
}

// normalizeEmail は前後の空白除去と小文字化を行い、形式を検証する。
func normalizeEmail(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	addr, err := mail.ParseAddress(s)
	if err != nil || addr.Address != s {
		return "", domain.Invalid("email is invalid")
	}
	return s, nil
}

func validatePassword(s string) error {
	if len(s) < minPasswordLen || len(s) > maxPasswordLen {
		return domain.Invalid("password must be %d to %d characters", minPasswordLen, maxPasswordLen)
	}
	return nil
}
