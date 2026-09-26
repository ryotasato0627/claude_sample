package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"taskapp/backend/internal/domain"
)

type AuthService struct {
	users    UserRepository
	hasher   PasswordHasher
	issuer   TokenIssuer
	verifier TokenVerifier

	// dummyHash は、存在しないメールでのログイン時にも同じ計算コストの比較を行うためのハッシュ。
	// (メールの有無を応答時間の差から推測されないようにする)
	dummyHash string
}

func NewAuthService(users UserRepository, hasher PasswordHasher, issuer TokenIssuer, verifier TokenVerifier) *AuthService {
	// ハッシュ化に失敗した場合は空になり、比較は即座に失敗する(応答時間の均一化が効かないだけで、認証結果には影響しない)
	dummy, _ := hasher.Hash("timing-equalization-dummy-password")
	return &AuthService{users: users, hasher: hasher, issuer: issuer, verifier: verifier, dummyHash: dummy}
}

// Register はユーザーを登録する。メールアドレスは小文字に正規化して保存する。
func (s *AuthService) Register(ctx context.Context, email, name, password string) (domain.User, error) {
	email, err := normalizeEmail(email)
	if err != nil {
		return domain.User{}, err
	}
	name, err = requiredText("name", name, maxNameLen)
	if err != nil {
		return domain.User{}, err
	}
	if err := validatePassword(password); err != nil {
		return domain.User{}, err
	}

	hash, err := s.hasher.Hash(password)
	if err != nil {
		return domain.User{}, fmt.Errorf("hash password: %w", err)
	}
	// メールアドレスの重複は repository が domain.ErrConflict で返す
	return s.users.Create(ctx, email, name, hash)
}

// Login は認証して JWT を発行する。メール不明・パスワード不一致は区別せず ErrUnauthorized。
func (s *AuthService) Login(ctx context.Context, email, password string) (domain.User, string, time.Time, error) {
	email, err := normalizeEmail(email)
	if err != nil {
		return domain.User{}, "", time.Time{}, domain.ErrUnauthorized
	}
	user, err := s.users.GetByEmail(ctx, email)
	if errors.Is(err, domain.ErrNotFound) {
		_ = s.hasher.Compare(s.dummyHash, password) // メールがあるときと同じ時間をかける
		return domain.User{}, "", time.Time{}, domain.ErrUnauthorized
	}
	if err != nil {
		return domain.User{}, "", time.Time{}, err
	}
	if err := s.hasher.Compare(user.PasswordHash, password); err != nil {
		return domain.User{}, "", time.Time{}, domain.ErrUnauthorized
	}

	token, expiresAt, err := s.issuer.Issue(user.ID)
	if err != nil {
		return domain.User{}, "", time.Time{}, fmt.Errorf("issue token: %w", err)
	}
	return user, token, expiresAt, nil
}

// Authenticate はトークンを検証してユーザー ID を返す。不正・期限切れは ErrUnauthorized。
func (s *AuthService) Authenticate(_ context.Context, token string) (int64, error) {
	userID, err := s.verifier.Verify(token)
	if err != nil {
		return 0, domain.ErrUnauthorized
	}
	return userID, nil
}
