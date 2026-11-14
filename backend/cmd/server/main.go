// Command server は API サーバーのエントリポイント。
// 具体実装の生成と注入(composition root)は app.go だけで行う。
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"taskapp/backend/internal/repository"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	dsn, err := mustEnv("DATABASE_URL")
	if err != nil {
		return err
	}
	jwtSecret, err := mustEnv("JWT_SECRET")
	if err != nil {
		return err
	}
	db, err := repository.Open(ctx, dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	r, err := newRouter(db, jwtSecret, 0)
	if err != nil {
		return err
	}

	addr := ":" + getEnv("PORT", "8080")
	log.Printf("listening on %s", addr)
	return r.Run(addr)
}

func mustEnv(key string) (string, error) {
	v := os.Getenv(key)
	if v == "" {
		return "", fmt.Errorf("required environment variable is not set: %s", key)
	}
	return v, nil
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
