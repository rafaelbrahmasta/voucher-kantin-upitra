package mail

import (
	"encoding/base64"
	"strings"
)

func decodeB64(s string) ([]byte, error) {
	s = strings.NewReplacer("\r", "", "\n", "").Replace(s)
	return base64.StdEncoding.DecodeString(s)
}
