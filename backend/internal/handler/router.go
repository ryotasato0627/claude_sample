package handler

import (
	"github.com/gin-gonic/gin"

	"taskapp/backend/internal/handler/openapi"
)

// NewRouter は生成コードを使ってルーティングを組み立てる。
func NewRouter(h openapi.ServerInterface) *gin.Engine {
	r := gin.New()
	// リバースプロキシのヘッダを信用しない(必要になったら信頼するプロキシを明示する)
	_ = r.SetTrustedProxies(nil)
	r.Use(gin.Logger(), gin.Recovery())
	openapi.RegisterHandlers(r, h)
	return r
}
