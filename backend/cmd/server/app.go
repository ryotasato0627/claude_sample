package main

import (
	"database/sql"
	"time"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler"
	"taskapp/backend/internal/infra"
	"taskapp/backend/internal/repository"
	"taskapp/backend/internal/service"
)

// tokenTTL は JWT の有効期間(リフレッシュトークンは対象外)。
const tokenTTL = 24 * time.Hour

// newRouter は composition root。具体実装の生成と注入は、ここだけで行う。
//
//	infra / repository(具体実装) ─▶ service(port を満たす) ─▶ handler(interface 越しに利用)
//
// hashCost は bcrypt のコスト。0 なら既定値(テストでは小さい値を渡して高速化する)。
func newRouter(db *sql.DB, jwtSecret string, hashCost int) (*gin.Engine, error) {
	tokens, err := infra.NewJWTManager(jwtSecret, tokenTTL, infra.SystemClock{})
	if err != nil {
		return nil, err
	}
	hasher := infra.NewBcryptHasher(hashCost)

	users := repository.NewUserRepo(db)
	projects := repository.NewProjectRepo(db)
	tasks := repository.NewTaskRepo(db)
	comments := repository.NewCommentRepo(db)

	auth := service.NewAuthService(users, hasher, tokens, tokens)

	h := handler.New(handler.Deps{
		DB:       db,
		Auth:     auth,
		Projects: service.NewProjectService(projects, users),
		Tasks:    service.NewTaskService(tasks, projects),
		Comments: service.NewCommentService(comments, tasks, projects),
	})
	return handler.NewRouter(h, auth), nil
}
