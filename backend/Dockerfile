# syntax=docker/dockerfile:1

# ---- dev: ホットリロード + lint/テスト用(ソースはボリュームマウントする) ----
FROM golang:1.25-alpine AS dev
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN apk add --no-cache git \
    && addgroup -g ${HOST_GID} dev && adduser -D -u ${HOST_UID} -G dev dev \
    && mkdir -p /go/pkg /tmp/air /tmp/go-build && chown -R dev:dev /go /tmp/air /tmp/go-build
ENV GOCACHE=/tmp/go-build
COPY --from=golangci/golangci-lint:v2.14.0-alpine /usr/bin/golangci-lint /usr/local/bin/golangci-lint
USER dev
RUN go install github.com/air-verse/air@v1.62.0
ENV PATH="/go/bin:${PATH}"
WORKDIR /workspace/backend
CMD ["air", "-c", ".air.toml"]

# ---- build: 静的バイナリを作る ----
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# ---- prod ----
FROM gcr.io/distroless/static-debian12:nonroot AS prod
ENV GIN_MODE=release
COPY --from=build /out/server /server
EXPOSE 8080
ENTRYPOINT ["/server"]
