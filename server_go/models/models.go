package models

import "encoding/json"

type GroupRole string

const (
	RoleOwner  GroupRole = "owner"
	RoleAdmin  GroupRole = "admin"
	RoleMember GroupRole = "member"
)

type CreatorMeta struct {
	Active    bool   `json:"active"`
	ExpiresAt *int64 `json:"expiresAt,omitempty"`
}

type GroupMember struct {
	Nickname  string    `json:"nickname"`
	UserCode  string    `json:"userCode,omitempty"`
	UserId    string    `json:"userId,omitempty"`
	Role      GroupRole `json:"role"`
	JoinedAt  int64     `json:"joinedAt"`
	LastSeen  *int64    `json:"lastSeen,omitempty"`
	AvatarURL *string   `json:"avatarUrl,omitempty"`
}

type Group struct {
	ID              string        `json:"id"`
	Code            string        `json:"code"`
	Name            string        `json:"name"`
	Description     string        `json:"description"`
	AvatarURL       *string       `json:"avatarUrl"`
	CreatorNickname string        `json:"creatorNickname"`
	CreatorCode     *string       `json:"creatorCode,omitempty"`
	CreatorID       string        `json:"creatorId,omitempty"`
	MembersCount    int           `json:"membersCount"`
	MaxMembers      int           `json:"maxMembers"`
	Members         []GroupMember `json:"members"`
	CreatedAt       int64         `json:"createdAt"`
	UpdatedAt       int64         `json:"updatedAt"`
	SharedSecret    string        `json:"sharedSecret,omitempty"`
	InviteActive    bool          `json:"inviteActive"`
	InviteExpiresAt *int64        `json:"inviteExpiresAt,omitempty"`
}

type CreateGroupRequest struct {
	ID              string  `json:"id,omitempty"`
	Code            string  `json:"code,omitempty"`
	Name            string  `json:"name"`
	Description     string  `json:"description,omitempty"`
	CreatorNickname string  `json:"creatorNickname"`
	CreatorCode     string  `json:"creatorCode,omitempty"`
	CreatorUserId   string  `json:"creatorUserId,omitempty"`
	AvatarURL       *string `json:"avatarUrl,omitempty"`
}

type JoinGroupRequest struct {
	ID        string  `json:"id,omitempty"`
	Code      string  `json:"code,omitempty"`
	Nickname  string  `json:"nickname"`
	UserCode  string  `json:"userCode,omitempty"`
	UserId    string  `json:"userId,omitempty"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}

type UpdateGroupRequest struct {
	GroupID         string  `json:"groupId"`
	Name            *string `json:"name,omitempty"`
	Description     *string `json:"description,omitempty"`
	AvatarURL       *string `json:"avatarUrl,omitempty"`
	Code            *string `json:"code,omitempty"`
	InviteActive    *bool   `json:"inviteActive,omitempty"`
	InviteExpiresAt *int64  `json:"inviteExpiresAt,omitempty"`
	CreatorID       *string `json:"creator_id,omitempty"`
}

type ActionMemberRequest struct {
	GroupID        string    `json:"groupId"`
	TargetNickname string    `json:"targetNickname"`
	TargetUserCode string    `json:"targetUserCode,omitempty"`
	TargetUserId   string    `json:"targetUserId,omitempty"`
	AdminNickname  string    `json:"adminNickname,omitempty"`
	Role           GroupRole `json:"role,omitempty"`
}

type GroupResponse struct {
	Status string `json:"status"`
	Group  *Group `json:"group,omitempty"`
	Error  string `json:"error,omitempty"`
}

func (g *Group) SerializeCreatorMeta() string {
	meta := CreatorMeta{
		Active:    g.InviteActive,
		ExpiresAt: g.InviteExpiresAt,
	}
	bytes, err := json.Marshal(meta)
	if err != nil {
		return `{"active":true}`
	}
	return string(bytes)
}

func ParseCreatorMeta(raw string) (bool, *int64) {
	if len(raw) == 0 || raw[0] != '{' {
		return true, nil
	}
	var meta CreatorMeta
	if err := json.Unmarshal([]byte(raw), &meta); err != nil {
		return true, nil
	}
	return meta.Active, meta.ExpiresAt
}
