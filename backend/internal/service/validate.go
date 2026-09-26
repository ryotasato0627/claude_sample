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

	minPasswordChars = 8  // 文字数(rune)
	maxPasswordBytes = 72 // bcrypt の入力上限(バイト)
)

// checkText は、PostgreSQL が受け付けない NUL 文字を含まないことと、文字数が max 以内であることを検証する。
// (NUL を通すと DB エラーになり、500 になってしまうため、ここで 422 にする)
func checkText(field, s string, max int) error {
	if strings.ContainsRune(s, 0) {
		return domain.Invalid("%s must not contain NUL characters", field)
	}
	if utf8.RuneCountInString(s) > max {
		return domain.Invalid("%s must be at most %d characters", field, max)
	}
	return nil
}

// requiredText は前後の空白を除いた文字列が 1〜max 文字であることを検証する。
func requiredText(field, s string, max int) (string, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", domain.Invalid("%s is required", field)
	}
	if err := checkText(field, s, max); err != nil {
		return "", err
	}
	return s, nil
}

// optionalText は空でもよい文字列が max 文字以内であることを検証する。
func optionalText(field, s string, max int) (string, error) {
	s = strings.TrimSpace(s)
	if err := checkText(field, s, max); err != nil {
		return "", err
	}
	return s, nil
}

// optionalTextPtr は、nil(未指定)はそのまま返し、指定されていれば optionalText で検証する。
func optionalTextPtr(field string, s *string, max int) (*string, error) {
	if s == nil {
		return nil, nil
	}
	v, err := optionalText(field, *s, max)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// requiredTextPtr は、nil(未指定)はそのまま返し、指定されていれば requiredText で検証する。
func requiredTextPtr(field string, s *string, max int) (*string, error) {
	if s == nil {
		return nil, nil
	}
	v, err := requiredText(field, *s, max)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// normalizeEmail は前後の空白除去と小文字化を行い、形式を検証する。
func normalizeEmail(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	if strings.ContainsRune(s, 0) {
		return "", domain.Invalid("email is invalid")
	}
	addr, err := mail.ParseAddress(s)
	if err != nil || addr.Address != s {
		return "", domain.Invalid("email is invalid")
	}
	return s, nil
}

// validatePassword は、8 文字以上(文字数)かつ 72 バイト以下(bcrypt の上限)であることを検証する。
func validatePassword(s string) error {
	if utf8.RuneCountInString(s) < minPasswordChars || len(s) > maxPasswordBytes {
		return domain.Invalid("password must be at least %d characters and at most %d bytes", minPasswordChars, maxPasswordBytes)
	}
	return nil
}
