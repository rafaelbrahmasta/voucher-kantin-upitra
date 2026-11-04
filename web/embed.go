// Package web menyimpan template HTML dan file statis di dalam binary.
package web

import "embed"

//go:embed templates static
var FS embed.FS
