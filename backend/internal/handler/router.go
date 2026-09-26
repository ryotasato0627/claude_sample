package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler/openapi"
)

// NewRouter は生成コードを使ってルーティングを組み立てる。
// 認証は authMiddleware で一括して行い、publicPaths 以外は Bearer トークンが必須。
func NewRouter(h openapi.ServerInterface, auth Authenticator) *gin.Engine {
	r := gin.New()
	// リバースプロキシのヘッダを信用しない(必要になったら信頼するプロキシを明示する)
	_ = r.SetTrustedProxies(nil)
	r.Use(gin.Logger(), gin.CustomRecovery(func(c *gin.Context, recovered any) {
		_ = c.Error(fmt.Errorf("panic: %v", recovered))
		writeJSONError(c, http.StatusInternalServerError, "internal_error", "internal server error")
		c.Abort()
	}), limitBody)
	r.NoRoute(func(c *gin.Context) {
		writeJSONError(c, http.StatusNotFound, "not_found", "resource not found")
	})

	openapi.RegisterHandlersWithOptions(r, h, openapi.GinServerOptions{
		Middlewares: []openapi.MiddlewareFunc{authMiddleware(auth)},
		// パスパラメータ・クエリパラメータの形式エラー
		ErrorHandler: func(c *gin.Context, err error, status int) {
			writeJSONError(c, status, "bad_request", err.Error())
		},
	})
	return r
}
