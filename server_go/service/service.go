package service

import (
	"errors"
	"strings"
	"sync"
	"time"

	"orbita/groups/crypto"
	"orbita/groups/invite"
	"orbita/groups/models"
)

var (
	ErrGroupNotFound  = errors.New("GROUP_NOT_FOUND")
	ErrGroupFull      = errors.New("GROUP_FULL")
	ErrInviteRevoked  = errors.New("INVITE_REVOKED")
	ErrInviteExpired  = errors.New("INVITE_EXPIRED")
	ErrInvalidCode    = errors.New("INVALID_CODE")
	ErrMissingFields  = errors.New("MISSING_REQUIRED_FIELDS")
	ErrUnauthorized   = errors.New("UNAUTHORIZED")
)

type PersistenceBackend interface {
	SaveGroup(g *models.Group) error
	GetGroup(idOrCode string) (*models.Group, error)
	AddMember(groupId string, member *models.GroupMember) error
	RemoveMember(groupId, userIdentifier string) error
	UpdateGroupMeta(groupId string, updates map[string]interface{}) error
	DeleteGroup(groupId string) error
}

type GroupService struct {
	mu          sync.RWMutex
	groups      map[string]*models.Group
	codes       map[string]string
	persistence PersistenceBackend
}

func NewGroupService(backend PersistenceBackend) *GroupService {
	return &GroupService{
		groups:      make(map[string]*models.Group),
		codes:       make(map[string]string),
		persistence: backend,
	}
}

func (s *GroupService) CreateGroup(req models.CreateGroupRequest) (*models.Group, error) {
	name := strings.TrimSpace(req.Name)
	nickname := strings.TrimSpace(req.CreatorNickname)
	if len(name) == 0 || len(nickname) == 0 {
		return nil, ErrMissingFields
	}

	groupID := req.ID
	if len(groupID) == 0 {
		groupID = crypto.GenerateGroupId()
	}

	code := req.Code
	if len(code) == 0 {
		code = crypto.GenerateGroupInviteCode()
	}

	now := time.Now().UnixMilli()
	creatorCode := req.CreatorCode
	if len(creatorCode) == 0 {
		creatorCode = req.CreatorUserId
	}
	if len(creatorCode) == 0 {
		creatorCode = nickname
	}

	ownerMember := models.GroupMember{
		Nickname:  nickname,
		UserCode:  creatorCode,
		UserId:    req.CreatorUserId,
		Role:      models.RoleOwner,
		JoinedAt:  now,
		AvatarURL: req.AvatarURL,
	}

	sharedSecret := crypto.DeriveGroupKey(code)

	group := &models.Group{
		ID:              groupID,
		Code:            code,
		Name:            name,
		Description:     strings.TrimSpace(req.Description),
		AvatarURL:       req.AvatarURL,
		CreatorNickname: nickname,
		CreatorCode:     &creatorCode,
		CreatorID:       `{"active":true}`,
		MembersCount:    1,
		MaxMembers:      10,
		Members:         []models.GroupMember{ownerMember},
		CreatedAt:       now,
		UpdatedAt:       now,
		SharedSecret:    sharedSecret,
		InviteActive:    true,
		InviteExpiresAt: nil,
	}

	s.mu.Lock()
	s.groups[group.ID] = group
	s.codes[strings.ToLower(code)] = group.ID
	s.codes[strings.ToLower(group.ID)] = group.ID
	s.mu.Unlock()

	if s.persistence != nil {
		_ = s.persistence.SaveGroup(group)
		_ = s.persistence.AddMember(group.ID, &ownerMember)
	}

	return group, nil
}

func (s *GroupService) GetGroup(query string) (*models.Group, error) {
	clean := invite.ExtractGroupCode(query)
	if len(clean) == 0 {
		clean = strings.TrimSpace(query)
	}
	if len(clean) == 0 {
		return nil, ErrInvalidCode
	}

	s.mu.RLock()
	var found *models.Group
	if gid, ok := s.codes[strings.ToLower(clean)]; ok {
		found = s.groups[gid]
	}
	if found == nil {
		derived := crypto.DeriveGroupId(clean)
		if gid, ok := s.codes[strings.ToLower(derived)]; ok {
			found = s.groups[gid]
		}
	}
	s.mu.RUnlock()

	if found != nil {
		return found, nil
	}

	if s.persistence != nil {
		persisted, err := s.persistence.GetGroup(clean)
		if err == nil && persisted != nil {
			s.mu.Lock()
			s.groups[persisted.ID] = persisted
			s.codes[strings.ToLower(persisted.Code)] = persisted.ID
			s.codes[strings.ToLower(persisted.ID)] = persisted.ID
			s.mu.Unlock()
			return persisted, nil
		}
	}

	return nil, ErrGroupNotFound
}

func (s *GroupService) JoinGroup(req models.JoinGroupRequest) (*models.Group, error) {
	nickname := strings.TrimSpace(req.Nickname)
	if len(nickname) == 0 {
		return nil, ErrMissingFields
	}

	target := req.Code
	if len(target) == 0 {
		target = req.ID
	}
	cleanCode := invite.ExtractGroupCode(target)
	if len(cleanCode) == 0 {
		cleanCode = strings.TrimSpace(target)
	}

	group, err := s.GetGroup(cleanCode)
	if err != nil {
		return nil, err
	}

	valid, reason := invite.CheckInviteStatus(group.InviteActive, group.InviteExpiresAt, time.Now().UnixMilli())
	if !valid {
		if reason == "INVITE_REVOKED" {
			return nil, ErrInviteRevoked
		}
		return nil, ErrInviteExpired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, m := range group.Members {
		if req.UserId != "" && (m.UserId == req.UserId || m.UserCode == req.UserId) {
			return group, nil
		}
		if req.UserCode != "" && (m.UserCode == req.UserCode || m.UserId == req.UserCode) {
			return group, nil
		}
		if strings.EqualFold(m.Nickname, nickname) {
			return group, nil
		}
	}

	if len(group.Members) >= group.MaxMembers {
		return nil, ErrGroupFull
	}

	uCode := req.UserCode
	if len(uCode) == 0 {
		uCode = req.UserId
	}
	if len(uCode) == 0 {
		uCode = nickname
	}

	newMember := models.GroupMember{
		Nickname:  nickname,
		UserCode:  uCode,
		UserId:    req.UserId,
		Role:      models.RoleMember,
		JoinedAt:  time.Now().UnixMilli(),
		AvatarURL: req.AvatarURL,
	}

	group.Members = append(group.Members, newMember)
	group.MembersCount = len(group.Members)
	group.UpdatedAt = time.Now().UnixMilli()

	if s.persistence != nil {
		_ = s.persistence.AddMember(group.ID, &newMember)
		_ = s.persistence.UpdateGroupMeta(group.ID, map[string]interface{}{
			"members_count": group.MembersCount,
			"updated_at":    time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	return group, nil
}

func (s *GroupService) ResetInviteLink(groupID string) (string, error) {
	group, err := s.GetGroup(groupID)
	if err != nil {
		return "", err
	}

	newCode := crypto.GenerateGroupInviteCode()

	s.mu.Lock()
	delete(s.codes, strings.ToLower(group.Code))
	group.Code = newCode
	group.InviteActive = true
	group.InviteExpiresAt = nil
	group.SharedSecret = crypto.DeriveGroupKey(newCode)
	group.UpdatedAt = time.Now().UnixMilli()
	group.CreatorID = `{"active":true,"expiresAt":null}`
	s.codes[strings.ToLower(newCode)] = group.ID
	s.mu.Unlock()

	if s.persistence != nil {
		_ = s.persistence.UpdateGroupMeta(group.ID, map[string]interface{}{
			"code":       newCode,
			"creator_id": group.CreatorID,
			"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	return newCode, nil
}

func (s *GroupService) RevokeInviteLink(groupID string) error {
	group, err := s.GetGroup(groupID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	group.InviteActive = false
	group.UpdatedAt = time.Now().UnixMilli()
	group.CreatorID = `{"active":false}`
	s.mu.Unlock()

	if s.persistence != nil {
		_ = s.persistence.UpdateGroupMeta(group.ID, map[string]interface{}{
			"creator_id": group.CreatorID,
			"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	return nil
}

func (s *GroupService) EnableInviteLink(groupID string) error {
	group, err := s.GetGroup(groupID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	group.InviteActive = true
	group.UpdatedAt = time.Now().UnixMilli()
	group.CreatorID = `{"active":true}`
	s.mu.Unlock()

	if s.persistence != nil {
		_ = s.persistence.UpdateGroupMeta(group.ID, map[string]interface{}{
			"creator_id": group.CreatorID,
			"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	return nil
}

func (s *GroupService) SetInviteExpiration(groupID string, expiresAt *int64) error {
	group, err := s.GetGroup(groupID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	group.InviteActive = true
	group.InviteExpiresAt = expiresAt
	group.UpdatedAt = time.Now().UnixMilli()
	group.CreatorID = group.SerializeCreatorMeta()
	s.mu.Unlock()

	if s.persistence != nil {
		_ = s.persistence.UpdateGroupMeta(group.ID, map[string]interface{}{
			"creator_id": group.CreatorID,
			"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	return nil
}

func (s *GroupService) LeaveGroup(groupID, userIdentifier string) error {
	group, err := s.GetGroup(groupID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	var filtered []models.GroupMember
	for _, m := range group.Members {
		if m.UserId != userIdentifier && m.UserCode != userIdentifier && !strings.EqualFold(m.Nickname, userIdentifier) {
			filtered = append(filtered, m)
		}
	}

	group.Members = filtered
	group.MembersCount = len(filtered)
	group.UpdatedAt = time.Now().UnixMilli()

	if s.persistence != nil {
		_ = s.persistence.RemoveMember(group.ID, userIdentifier)
		_ = s.persistence.UpdateGroupMeta(group.ID, map[string]interface{}{
			"members_count": group.MembersCount,
			"updated_at":    time.Now().UTC().Format(time.RFC3339Nano),
		})
	}

	return nil
}

func (s *GroupService) KickMember(groupID, targetIdentifier string) error {
	return s.LeaveGroup(groupID, targetIdentifier)
}

func (s *GroupService) DeleteGroup(groupID string) error {
	group, err := s.GetGroup(groupID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	delete(s.groups, group.ID)
	delete(s.codes, strings.ToLower(group.Code))
	delete(s.codes, strings.ToLower(group.ID))
	s.mu.Unlock()

	if s.persistence != nil {
		_ = s.persistence.DeleteGroup(group.ID)
	}

	return nil
}
