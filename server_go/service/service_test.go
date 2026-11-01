package service

import (
	"testing"
	"time"

	"orbita/groups/models"
)

func TestGroupLifecycle(t *testing.T) {
	svc := NewGroupService(nil)

	created, err := svc.CreateGroup(models.CreateGroupRequest{
		Name:            "Orbita Test Group",
		CreatorNickname: "Saizzi",
		CreatorCode:     "USR1234567890",
	})
	if err != nil {
		t.Fatalf("failed to create group: %v", err)
	}

	if created.MembersCount != 1 || created.Members[0].Role != models.RoleOwner {
		t.Fatalf("invalid initial members state")
	}

	byCode, err := svc.GetGroup(created.Code)
	if err != nil || byCode.ID != created.ID {
		t.Fatalf("failed to get group by code: %v", err)
	}

	byUrl, err := svc.GetGroup("https://orbitad.vercel.app/groups/#" + created.Code)
	if err != nil || byUrl.ID != created.ID {
		t.Fatalf("failed to get group by url: %v", err)
	}

	joined, err := svc.JoinGroup(models.JoinGroupRequest{
		Code:     created.Code,
		Nickname: "User2",
		UserId:   "USR9999999999",
	})
	if err != nil {
		t.Fatalf("failed to join group: %v", err)
	}
	if joined.MembersCount != 2 {
		t.Fatalf("expected 2 members, got %d", joined.MembersCount)
	}

	rejoin, err := svc.JoinGroup(models.JoinGroupRequest{
		Code:     created.Code,
		Nickname: "User2",
		UserId:   "USR9999999999",
	})
	if err != nil || rejoin.MembersCount != 2 {
		t.Fatalf("duplicate join should be idempotent and not increase count")
	}

	oldCode := created.Code
	newCode, err := svc.ResetInviteLink(created.ID)
	if err != nil {
		t.Fatalf("reset invite link error: %v", err)
	}
	if newCode == oldCode {
		t.Fatalf("reset invite link returned same code")
	}

	_, err = svc.GetGroup(oldCode)
	if err == nil {
		t.Fatalf("old invite code should no longer resolve")
	}

	byNewCode, err := svc.GetGroup(newCode)
	if err != nil || byNewCode.ID != created.ID {
		t.Fatalf("failed to get group by new code: %v", err)
	}

	err = svc.RevokeInviteLink(created.ID)
	if err != nil {
		t.Fatalf("failed to revoke invite: %v", err)
	}

	_, err = svc.JoinGroup(models.JoinGroupRequest{
		Code:     newCode,
		Nickname: "User3",
	})
	if err != ErrInviteRevoked {
		t.Fatalf("expected ErrInviteRevoked, got %v", err)
	}

	err = svc.EnableInviteLink(created.ID)
	if err != nil {
		t.Fatalf("failed to enable invite: %v", err)
	}

	past := time.Now().UnixMilli() - 5000
	_ = svc.SetInviteExpiration(created.ID, &past)

	_, err = svc.JoinGroup(models.JoinGroupRequest{
		Code:     newCode,
		Nickname: "User3",
	})
	if err != ErrInviteExpired {
		t.Fatalf("expected ErrInviteExpired, got %v", err)
	}
}
