package infra_test

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"taskapp/backend/internal/infra"
)

const secret = "0123456789abcdef-test-secret"

type fixedClock struct{ t time.Time }

func (c *fixedClock) Now() time.Time { return c.t }

var t0 = time.Date(2030, 1, 1, 12, 0, 0, 0, time.UTC)

func TestBcryptHasher(t *testing.T) {
	h := infra.NewBcryptHasher(bcrypt.MinCost)

	hash, err := h.Hash("password123")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "password123" {
		t.Fatal("password must not be stored in plain text")
	}
	if err := h.Compare(hash, "password123"); err != nil {
		t.Errorf("correct password: %v", err)
	}
	if err := h.Compare(hash, "wrong"); err == nil {
		t.Error("wrong password must fail")
	}
	// 同じパスワードでもソルトによりハッシュは毎回変わる
	hash2, _ := h.Hash("password123")
	if hash == hash2 {
		t.Error("hashes must be salted")
	}
}

func TestJWTManager_IssueAndVerify(t *testing.T) {
	clock := &fixedClock{t0}
	m, err := infra.NewJWTManager(secret, 24*time.Hour, clock)
	if err != nil {
		t.Fatal(err)
	}

	token, exp, err := m.Issue(42)
	if err != nil {
		t.Fatal(err)
	}
	if want := t0.Add(24 * time.Hour); !exp.Equal(want) {
		t.Errorf("expiresAt = %v, want %v", exp, want)
	}
	id, err := m.Verify(token)
	if err != nil || id != 42 {
		t.Errorf("id=%d err=%v, want 42 nil", id, err)
	}

	t.Run("有効期限の直前は有効、期限を過ぎたら無効", func(t *testing.T) {
		clock.t = t0.Add(24*time.Hour - time.Second)
		if _, err := m.Verify(token); err != nil {
			t.Errorf("just before expiry: %v", err)
		}
		clock.t = t0.Add(24*time.Hour + time.Second)
		if _, err := m.Verify(token); err == nil {
			t.Error("expired token must be rejected")
		}
		clock.t = t0
	})

	t.Run("別の鍵で署名されたトークンは無効", func(t *testing.T) {
		other, _ := infra.NewJWTManager("another-secret-0123456789", time.Hour, clock)
		forged, _, _ := other.Issue(1)
		if _, err := m.Verify(forged); err == nil {
			t.Error("token signed with another secret must be rejected")
		}
	})

	t.Run("改ざんされたトークンは無効", func(t *testing.T) {
		parts := strings.Split(token, ".")
		tampered := parts[0] + "." + parts[1] + "x." + parts[2]
		if _, err := m.Verify(tampered); err == nil {
			t.Error("tampered token must be rejected")
		}
	})

	t.Run("alg=none のトークンは無効", func(t *testing.T) {
		claims := jwt.RegisteredClaims{Subject: "1", ExpiresAt: jwt.NewNumericDate(t0.Add(time.Hour))}
		none, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := m.Verify(none); err == nil {
			t.Error("alg=none must be rejected")
		}
	})

	t.Run("別のアルゴリズム(HS512)は無効", func(t *testing.T) {
		claims := jwt.RegisteredClaims{Subject: "1", ExpiresAt: jwt.NewNumericDate(t0.Add(time.Hour))}
		hs512, _ := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString([]byte(secret))
		if _, err := m.Verify(hs512); err == nil {
			t.Error("HS512 must be rejected")
		}
	})

	t.Run("有効期限のないトークンは無効", func(t *testing.T) {
		claims := jwt.RegisteredClaims{Subject: "1"}
		noExp, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
		if _, err := m.Verify(noExp); err == nil {
			t.Error("token without exp must be rejected")
		}
	})

	t.Run("subject が不正なトークンは無効", func(t *testing.T) {
		for _, sub := range []string{"", "abc", "0", "-1"} {
			claims := jwt.RegisteredClaims{Subject: sub, ExpiresAt: jwt.NewNumericDate(t0.Add(time.Hour))}
			tok, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
			if _, err := m.Verify(tok); err == nil {
				t.Errorf("subject %q must be rejected", sub)
			}
		}
	})

	t.Run("空文字・ゴミは無効", func(t *testing.T) {
		for _, tok := range []string{"", "garbage", "a.b.c"} {
			if _, err := m.Verify(tok); err == nil {
				t.Errorf("token %q must be rejected", tok)
			}
		}
	})
}

func TestNewJWTManager_Validation(t *testing.T) {
	if _, err := infra.NewJWTManager("short", time.Hour, infra.SystemClock{}); err == nil {
		t.Error("short secret must be rejected")
	}
	if _, err := infra.NewJWTManager(secret, 0, infra.SystemClock{}); err == nil {
		t.Error("non-positive ttl must be rejected")
	}
}
