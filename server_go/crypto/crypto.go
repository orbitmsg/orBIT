package crypto

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
	"regexp"
	"strings"
)

var codeRegex = regexp.MustCompile(`^[0-9A-Za-z_-]{8,64}$`)
var joinRegex = regexp.MustCompile(`^join_[0-9A-Za-z_-]{6,32}$`)

func hkdfExtract(salt, ikm []byte) []byte {
	if len(salt) == 0 {
		salt = make([]byte, sha256.Size)
	}
	mac := hmac.New(sha256.New, salt)
	mac.Write(ikm)
	return mac.Sum(nil)
}

func hkdfExpand(prk, info []byte, length int) []byte {
	var result []byte
	var prev []byte
	counter := byte(1)

	for len(result) < length {
		mac := hmac.New(sha256.New, prk)
		if len(prev) > 0 {
			mac.Write(prev)
		}
		if len(info) > 0 {
			mac.Write(info)
		}
		mac.Write([]byte{counter})
		prev = mac.Sum(nil)
		result = append(result, prev...)
		counter++
	}

	return result[:length]
}

func DeriveGroupKey(keySource string) string {
	trimmed := strings.TrimSpace(keySource)
	salt := []byte("orbita-group-salt-v1")
	info := []byte("orbita-group-e2ee-key-v1")
	prk := hkdfExtract(salt, []byte(trimmed))
	keyBytes := hkdfExpand(prk, info, 32)
	return strings.ToUpper(hex.EncodeToString(keyBytes))
}

func DeriveGroupId(input string) string {
	trimmed := strings.TrimSpace(input)
	if len(trimmed) == 36 && regexp.MustCompile(`^[0-9A-Z]{36}$`).MatchString(strings.ToUpper(trimmed)) {
		return strings.ToUpper(trimmed)
	}
	h := sha256.New()
	h.Write([]byte(trimmed))
	fullHex := strings.ToUpper(hex.EncodeToString(h.Sum(nil)))
	if len(fullHex) > 36 {
		return fullHex[:36]
	}
	return fullHex
}

func GenerateGroupInviteCode() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 32)
	maxIdx := big.NewInt(int64(len(chars)))
	for i := range b {
		n, err := rand.Int(rand.Reader, maxIdx)
		if err != nil {
			b[i] = chars[i%len(chars)]
			continue
		}
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

func GenerateGroupId() string {
	const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	b := make([]byte, 36)
	maxIdx := big.NewInt(int64(len(chars)))
	for i := range b {
		n, err := rand.Int(rand.Reader, maxIdx)
		if err != nil {
			b[i] = chars[i%len(chars)]
			continue
		}
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

func IsValidGroupCode(code string) bool {
	cleaned := strings.TrimSpace(code)
	if len(cleaned) < 8 || len(cleaned) > 64 {
		return false
	}
	if joinRegex.MatchString(cleaned) {
		return true
	}
	if len(cleaned) == 54 && regexp.MustCompile(`^[0-9A-Za-z]{54}$`).MatchString(cleaned) {
		return true
	}
	if len(cleaned) == 36 && regexp.MustCompile(`^[0-9A-Za-z]{36}$`).MatchString(cleaned) {
		return true
	}
	return codeRegex.MatchString(cleaned)
}
