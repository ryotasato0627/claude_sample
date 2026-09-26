package service_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/service"
)

func newAuth() (*service.AuthService, *store) {
	s := newStore()
	return service.NewAuthService(fakeUsers{s}, fakeHasher{}, fakeTokens{}, fakeTokens{}), s
}

func isValidation(err error) bool {
	var ve *domain.ValidationError
	return errors.As(err, &ve)
}

func TestRegister(t *testing.T) {
	ctx := context.Background()

	t.Run("正常系: メールは小文字に正規化され、パスワードはハッシュ化される", func(t *testing.T) {
		auth, _ := newAuth()
		u, err := auth.Register(ctx, "  Alice@Example.COM ", " Alice ", "password123")
		if err != nil {
			t.Fatal(err)
		}
		if u.Email != "alice@example.com" || u.Name != "Alice" {
			t.Errorf("got %+v", u)
		}
		if u.PasswordHash == "password123" || u.PasswordHash == "" {
			t.Errorf("password must be hashed, got %q", u.PasswordHash)
		}
	})

	t.Run("メールの重複は大文字小文字を区別せず ErrConflict", func(t *testing.T) {
		auth, _ := newAuth()
		if _, err := auth.Register(ctx, "a@example.com", "A", "password123"); err != nil {
			t.Fatal(err)
		}
		if _, err := auth.Register(ctx, "A@EXAMPLE.com", "B", "password123"); !errors.Is(err, domain.ErrConflict) {
			t.Errorf("err = %v, want ErrConflict", err)
		}
	})

	invalid := []struct{ name, email, uname, password string }{
		{"メール形式が不正", "not-an-email", "A", "password123"},
		{"メールが空", "", "A", "password123"},
		{"表示名が空白のみ", "a@example.com", "   ", "password123"},
		{"表示名が長すぎる", "a@example.com", strings.Repeat("あ", 101), "password123"},
		{"パスワードが 7 文字", "a@example.com", "A", "1234567"},
		{"パスワードが 73 バイト", "a@example.com", "A", strings.Repeat("a", 73)},
	}
	for _, tt := range invalid {
		t.Run("入力検証: "+tt.name, func(t *testing.T) {
			auth, _ := newAuth()
			if _, err := auth.Register(ctx, tt.email, tt.uname, tt.password); !isValidation(err) {
				t.Errorf("err = %v, want ValidationError", err)
			}
		})
	}

	t.Run("パスワードが 8 文字ちょうどは OK", func(t *testing.T) {
		auth, _ := newAuth()
		if _, err := auth.Register(ctx, "a@example.com", "A", "12345678"); err != nil {
			t.Errorf("err = %v", err)
		}
	})
}

func TestLogin(t *testing.T) {
	ctx := context.Background()
	auth, _ := newAuth()
	u, err := auth.Register(ctx, "a@example.com", "A", "password123")
	if err != nil {
		t.Fatal(err)
	}

	t.Run("正常系", func(t *testing.T) {
		user, token, exp, err := auth.Login(ctx, "A@Example.com", "password123")
		if err != nil {
			t.Fatal(err)
		}
		if user.ID != u.ID || token == "" || !exp.Equal(fakeExpiry) {
			t.Errorf("got user=%+v token=%q exp=%v", user, token, exp)
		}
	})

	for _, tt := range []struct{ name, email, password string }{
		{"パスワード不一致", "a@example.com", "wrong-password"},
		{"存在しないメール", "nobody@example.com", "password123"},
		{"メール形式が不正", "invalid", "password123"},
	} {
		t.Run("失敗は区別せず ErrUnauthorized: "+tt.name, func(t *testing.T) {
			if _, _, _, err := auth.Login(ctx, tt.email, tt.password); !errors.Is(err, domain.ErrUnauthorized) {
				t.Errorf("err = %v, want ErrUnauthorized", err)
			}
		})
	}
}

func TestAuthenticate(t *testing.T) {
	auth, _ := newAuth()
	ctx := context.Background()

	id, err := auth.Authenticate(ctx, "token-42")
	if err != nil || id != 42 {
		t.Errorf("id=%d err=%v, want 42 nil", id, err)
	}
	if _, err := auth.Authenticate(ctx, "garbage"); !errors.Is(err, domain.ErrUnauthorized) {
		t.Errorf("err = %v, want ErrUnauthorized", err)
	}
}
