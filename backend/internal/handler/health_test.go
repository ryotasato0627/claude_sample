package handler_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"taskapp/backend/internal/handler"
)

type fakePinger struct{ err error }

func (f fakePinger) PingContext(context.Context) error { return f.err }

func TestGetHealth(t *testing.T) {
	tests := []struct {
		name       string
		pingErr    error
		wantStatus int
		wantBody   string
	}{
		{"db ok", nil, http.StatusOK, `{"status":"ok"}`},
		{"db down", errors.New("down"), http.StatusServiceUnavailable, `{"status":"unavailable"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := handler.NewRouter(handler.New(fakePinger{err: tt.pingErr}))
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/health", nil))

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d", w.Code, tt.wantStatus)
			}
			if got := w.Body.String(); got != tt.wantBody {
				t.Errorf("body = %s, want %s", got, tt.wantBody)
			}
		})
	}
}
