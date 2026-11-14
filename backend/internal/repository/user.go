// Package repository は service が定義した port の実装(database/sql + sqlc)を置く。
// sqlc の生成型(sqlcgen)はこのパッケージの外に出さず、domain の型へ変換して返す。
package repository

import (
	"context"
	"database/sql"

	"taskapp/backend/internal/domain"
	"taskapp/backend/internal/repository/sqlcgen"
	"taskapp/backend/internal/service"
)

var _ service.UserRepository = (*UserRepo)(nil)

type UserRepo struct {
	q *sqlcgen.Queries
}

func NewUserRepo(db *sql.DB) *UserRepo { return &UserRepo{q: sqlcgen.New(db)} }

func (r *UserRepo) Create(ctx context.Context, email, name, passwordHash string) (domain.User, error) {
	u, err := r.q.CreateUser(ctx, sqlcgen.CreateUserParams{Email: email, Name: name, PasswordHash: passwordHash})
	if err != nil {
		return domain.User{}, mapErr(err)
	}
	return toUser(u), nil
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (domain.User, error) {
	u, err := r.q.GetUserByEmail(ctx, email)
	if err != nil {
		return domain.User{}, mapErr(err)
	}
	return toUser(u), nil
}

func toUser(u sqlcgen.User) domain.User {
	return domain.User{ID: u.ID, Email: u.Email, Name: u.Name, PasswordHash: u.PasswordHash, CreatedAt: u.CreatedAt}
}
