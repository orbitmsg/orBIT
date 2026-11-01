package invite

import (
	"testing"
	"time"
)

func TestExtractGroupCode(t *testing.T) {
	code := "pyyd8m8on0fvidws2ohft60j65gabxid"
	cases := []string{
		code,
		"#" + code,
		"https://orbitachat.vercel.app/groups/#" + code,
		"https://orbitad.vercel.app/groups/#" + code,
		"https://orbitad.vercel.app/groups/" + code,
		"orbita://group/" + code,
		"orbita://invite?code=" + code,
		"https://orbita.app/join?group=" + code,
		"join_12345678abcdef",
		"orbita/join_12345678abcdef",
	}

	for _, c := range cases {
		extracted := ExtractGroupCode(c)
		if len(extracted) == 0 {
			t.Fatalf("failed to extract code from: %s", c)
		}
	}

	if ExtractGroupCode("https://orbitad.vercel.app/groups/#"+code) != code {
		t.Fatalf("expected extracted code %s, got %s", code, ExtractGroupCode("https://orbitad.vercel.app/groups/#"+code))
	}
}

func TestCheckInviteStatus(t *testing.T) {
	valid, reason := CheckInviteStatus(false, nil, 0)
	if valid || reason != "INVITE_REVOKED" {
		t.Fatalf("expected revoked, got valid: %v, reason: %s", valid, reason)
	}

	past := time.Now().UnixMilli() - 10000
	valid, reason = CheckInviteStatus(true, &past, time.Now().UnixMilli())
	if valid || reason != "INVITE_EXPIRED" {
		t.Fatalf("expected expired, got valid: %v, reason: %s", valid, reason)
	}

	future := time.Now().UnixMilli() + 60000
	valid, reason = CheckInviteStatus(true, &future, time.Now().UnixMilli())
	if !valid || reason != "" {
		t.Fatalf("expected valid, got valid: %v, reason: %s", valid, reason)
	}
}
