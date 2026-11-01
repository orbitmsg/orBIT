package crypto

import (
	"testing"
)

func TestDeriveGroupKey(t *testing.T) {
	expected := "A28896D9B465C87FAD313020D03ED8360753644D1FE0F6FE6786F8F495EEC167"
	actual := DeriveGroupKey("pyyd8m8on0fvidws2ohft60j65gabxid")
	if actual != expected {
		t.Fatalf("expected key %s, got %s", expected, actual)
	}
}

func TestDeriveGroupId(t *testing.T) {
	expected := "191D9B849A750F1C37816B1888F7473DEF85"
	actual := DeriveGroupId("pyyd8m8on0fvidws2ohft60j65gabxid")
	if actual != expected {
		t.Fatalf("expected id %s, got %s", expected, actual)
	}
}

func TestGenerateAndValidateCode(t *testing.T) {
	code := GenerateGroupInviteCode()
	if len(code) != 32 {
		t.Fatalf("invalid code length %d", len(code))
	}
	if !IsValidGroupCode(code) {
		t.Fatalf("generated code %s should be valid", code)
	}
	id := GenerateGroupId()
	if len(id) != 36 {
		t.Fatalf("invalid id length %d", len(id))
	}
}
