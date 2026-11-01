package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"orbita/groups/models"
)

type SupabaseBackend struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

func NewSupabaseBackend(baseURL, apiKey string) *SupabaseBackend {
	cleanURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if len(cleanURL) == 0 {
		cleanURL = "https://vxjaybyveerulkdqhggr.supabase.co"
	}
	key := strings.TrimSpace(apiKey)
	if len(key) == 0 {
		key = "sb_publishable_x6OPhg68nS-xBcPn4K47NQ_2nSS4Kfu"
	}
	return &SupabaseBackend{
		baseURL: cleanURL,
		apiKey:  key,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (b *SupabaseBackend) doRequest(method, path string, body interface{}, headers map[string]string) ([]byte, error) {
	fullURL := b.baseURL + "/rest/v1" + path
	var bodyReader io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyReader = bytes.NewReader(jsonBytes)
	}

	req, err := http.NewRequest(method, fullURL, bodyReader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("apikey", b.apiKey)
	req.Header.Set("Authorization", "Bearer "+b.apiKey)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := b.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("supabase error (%d): %s", resp.StatusCode, string(respBytes))
	}

	return respBytes, nil
}

func (b *SupabaseBackend) SaveGroup(g *models.Group) error {
	nowIso := time.Now().UTC().Format(time.RFC3339Nano)
	row := map[string]interface{}{
		"id":               g.ID,
		"code":             g.Code,
		"name":             g.Name,
		"description":      g.Description,
		"avatar_url":       g.AvatarURL,
		"creator_id":       g.CreatorID,
		"creator_code":     g.CreatorCode,
		"creator_nickname": g.CreatorNickname,
		"max_members":      g.MaxMembers,
		"members_count":    g.MembersCount,
		"created_at":       nowIso,
		"updated_at":       nowIso,
	}

	headers := map[string]string{"Prefer": "resolution=merge-duplicates"}
	_, err := b.doRequest(http.MethodPost, "/groups", row, headers)
	return err
}

func (b *SupabaseBackend) GetGroup(idOrCode string) (*models.Group, error) {
	escaped := url.QueryEscape(idOrCode)
	path := fmt.Sprintf("/groups?or=(id.eq.%s,code.eq.%s)&limit=1", escaped, escaped)
	data, err := b.doRequest(http.MethodGet, path, nil, nil)
	if err != nil {
		return nil, err
	}

	var rows []map[string]interface{}
	if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
		return nil, ErrGroupNotFound
	}

	r := rows[0]
	id, _ := r["id"].(string)
	code, _ := r["code"].(string)
	name, _ := r["name"].(string)
	desc, _ := r["description"].(string)
	creatorNick, _ := r["creator_nickname"].(string)
	creatorIdRaw, _ := r["creator_id"].(string)

	var avatarURL *string
	if av, ok := r["avatar_url"].(string); ok && len(av) > 0 {
		avatarURL = &av
	}

	var creatorCode *string
	if cc, ok := r["creator_code"].(string); ok && len(cc) > 0 {
		creatorCode = &cc
	}

	active, expiresAt := models.ParseCreatorMeta(creatorIdRaw)

	membersPath := fmt.Sprintf("/group_members?group_id=eq.%s", url.QueryEscape(id))
	membersData, _ := b.doRequest(http.MethodGet, membersPath, nil, nil)
	var memberRows []map[string]interface{}
	var members []models.GroupMember
	if membersData != nil {
		_ = json.Unmarshal(membersData, &memberRows)
		for _, mr := range memberRows {
			mNick, _ := mr["nickname"].(string)
			mUserCode, _ := mr["user_code"].(string)
			mUserId, _ := mr["user_id"].(string)
			mRole, _ := mr["role"].(string)
			var mAvatar *string
			if av, ok := mr["avatar_url"].(string); ok && len(av) > 0 {
				mAvatar = &av
			}
			members = append(members, models.GroupMember{
				Nickname:  mNick,
				UserCode:  mUserCode,
				UserId:    mUserId,
				Role:      models.GroupRole(mRole),
				JoinedAt:  time.Now().UnixMilli(),
				AvatarURL: mAvatar,
			})
		}
	}

	count := len(members)
	if count == 0 {
		count = 1
	}

	return &models.Group{
		ID:              id,
		Code:            code,
		Name:            name,
		Description:     desc,
		AvatarURL:       avatarURL,
		CreatorNickname: creatorNick,
		CreatorCode:     creatorCode,
		CreatorID:       creatorIdRaw,
		MembersCount:    count,
		MaxMembers:      10,
		Members:         members,
		CreatedAt:       time.Now().UnixMilli(),
		UpdatedAt:       time.Now().UnixMilli(),
		InviteActive:    active,
		InviteExpiresAt: expiresAt,
	}, nil
}

func (b *SupabaseBackend) AddMember(groupId string, m *models.GroupMember) error {
	nowIso := time.Now().UTC().Format(time.RFC3339Nano)
	row := map[string]interface{}{
		"group_id":   groupId,
		"user_code":  m.UserCode,
		"user_id":    m.UserId,
		"nickname":   m.Nickname,
		"role":       string(m.Role),
		"avatar_url": m.AvatarURL,
		"joined_at":  nowIso,
		"last_seen":  nowIso,
	}
	headers := map[string]string{"Prefer": "resolution=merge-duplicates"}
	_, err := b.doRequest(http.MethodPost, "/group_members", row, headers)
	return err
}

func (b *SupabaseBackend) RemoveMember(groupId, userIdentifier string) error {
	escapedGid := url.QueryEscape(groupId)
	escapedUser := url.QueryEscape(userIdentifier)
	path := fmt.Sprintf("/group_members?group_id=eq.%s&or=(user_code.eq.%s,user_id.eq.%s,nickname.eq.%s)", escapedGid, escapedUser, escapedUser, escapedUser)
	_, err := b.doRequest(http.MethodDelete, path, nil, nil)
	return err
}

func (b *SupabaseBackend) UpdateGroupMeta(groupId string, updates map[string]interface{}) error {
	escapedGid := url.QueryEscape(groupId)
	path := fmt.Sprintf("/groups?id=eq.%s", escapedGid)
	_, err := b.doRequest(http.MethodPatch, path, updates, nil)
	return err
}

func (b *SupabaseBackend) DeleteGroup(groupId string) error {
	escapedGid := url.QueryEscape(groupId)
	path := fmt.Sprintf("/groups?id=eq.%s", escapedGid)
	_, err := b.doRequest(http.MethodDelete, path, nil, nil)
	return err
}
