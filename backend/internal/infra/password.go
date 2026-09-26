// Package infra は JWT・パスワードハッシュ・Clock など、service が定義した port の実装を置く。
package infra

import "golang.org/x/crypto/bcrypt"

// BcryptHasher は service.PasswordHasher の bcrypt 実装。
type BcryptHasher struct {
	cost int
}

// NewBcryptHasher は cost を指定して作る。0 なら bcrypt.DefaultCost。
func NewBcryptHasher(cost int) BcryptHasher {
	if cost == 0 {
		cost = bcrypt.DefaultCost
	}
	return BcryptHasher{cost: cost}
}

func (h BcryptHasher) Hash(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), h.cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (h BcryptHasher) Compare(hash, plain string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain))
}
