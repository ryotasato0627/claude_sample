// Package repository は service が定義した port の実装(database/sql + sqlc)を置く。
// sqlc の生成型(sqlcgen)はこのパッケージの外に出さず、domain の型へ変換して返す。
package repository
