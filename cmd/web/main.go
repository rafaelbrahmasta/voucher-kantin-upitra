// Command web menjalankan server web Voucher Kantin UPITRA.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "time/tzdata" // zona waktu tertanam, tidak bergantung pada OS server

	"voucher-kantin/internal/config"
	"voucher-kantin/internal/db"
	"voucher-kantin/internal/master"
	"voucher-kantin/internal/report"
	"voucher-kantin/internal/server"
	"voucher-kantin/internal/voucher"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("berhenti karena error", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	if err := config.LoadDotEnv(".env"); err != nil {
		return err
	}
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	srv, err := server.New(cfg, server.Deps{
		DB:      pool,
		Scanner: voucher.NewService(pool),
		Reports: report.NewService(pool),
		Master:  master.NewService(pool),
	}, log)
	if err != nil {
		return err
	}
	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("server berjalan", "addr", cfg.Addr, "env", cfg.Env)
		errCh <- httpSrv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("mematikan server...")
		sctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpSrv.Shutdown(sctx)
	}
	return nil
}
