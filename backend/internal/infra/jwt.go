package infra

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// minSecretLen は JWT 署名鍵の最小長(バイト)。
const minSecretLen = 16

// Clock は現在時刻の供給元。テストで固定できるよう、時刻は必ずここを経由する。
type Clock interface {
	Now() time.Time
}

// SystemClock は実時刻を返す Clock。
type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }

// JWTManager は service.TokenIssuer / service.TokenVerifier の JWT(HS256)実装。
type JWTManager struct {
	secret []byte
	ttl    time.Duration
	clock  Clock
}

func NewJWTManager(secret string, ttl time.Duration, clock Clock) (*JWTManager, error) {
	if len(secret) < minSecretLen {
		return nil, fmt.Errorf("JWT secret must be at least %d bytes", minSecretLen)
	}
	if ttl <= 0 {
		return nil, errors.New("JWT ttl must be positive")
	}
	return &JWTManager{secret: []byte(secret), ttl: ttl, clock: clock}, nil
}

// Issue は userID を subject に持つトークンと、その有効期限を返す。
func (m *JWTManager) Issue(userID int64) (string, time.Time, error) {
	now := m.clock.Now()
	expiresAt := now.Add(m.ttl)
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(expiresAt),
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

// Verify は署名・アルゴリズム・有効期限を検証し、subject のユーザー ID を返す。
func (m *JWTManager) Verify(token string) (int64, error) {
	claims := &jwt.RegisteredClaims{}
	_, err := jwt.ParseWithClaims(token, claims,
		func(*jwt.Token) (any, error) { return m.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithTimeFunc(m.clock.Now),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return 0, err
	}
	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || userID <= 0 {
		return 0, errors.New("invalid subject")
	}
	return userID, nil
}
