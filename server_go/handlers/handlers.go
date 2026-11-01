package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"orbita/groups/models"
	"orbita/groups/service"
)

type APIHandler struct {
	svc *service.GroupService
}

func NewAPIHandler(svc *service.GroupService) *APIHandler {
	return &APIHandler{svc: svc}
}

func sendJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func sendError(w http.ResponseWriter, status int, message string) {
	sendJSON(w, status, map[string]interface{}{
		"status": "error",
		"error":  message,
	})
}

func (h *APIHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/groups/create", h.CreateGroup)
	mux.HandleFunc("/groups/get", h.GetGroup)
	mux.HandleFunc("/groups/join", h.JoinGroup)
	mux.HandleFunc("/groups/update", h.UpdateGroup)
	mux.HandleFunc("/groups/reset-invite", h.ResetInvite)
	mux.HandleFunc("/groups/revoke-invite", h.RevokeInvite)
	mux.HandleFunc("/groups/enable-invite", h.EnableInvite)
	mux.HandleFunc("/groups/delete", h.DeleteGroup)
	mux.HandleFunc("/groups/leave", h.LeaveGroup)
	mux.HandleFunc("/groups/kick", h.KickMember)
	mux.HandleFunc("/api/preview", h.HandlePreview)
	mux.HandleFunc("/health", h.Health)
}

func (h *APIHandler) Health(w http.ResponseWriter, r *http.Request) {
	sendJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "orbita-group-service-go",
	})
}

func (h *APIHandler) CreateGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req models.CreateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	grp, err := h.svc.CreateGroup(req)
	if err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"group":  grp,
	})
}

func (h *APIHandler) GetGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	query := r.URL.Query().Get("code")
	if len(query) == 0 {
		query = r.URL.Query().Get("id")
	}
	if len(query) == 0 {
		sendError(w, http.StatusBadRequest, "Missing group code or id")
		return
	}
	grp, err := h.svc.GetGroup(query)
	if err != nil {
		if err == service.ErrGroupNotFound {
			sendError(w, http.StatusNotFound, "Group not found")
			return
		}
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"group":  grp,
	})
}

func (h *APIHandler) JoinGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req models.JoinGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	grp, err := h.svc.JoinGroup(req)
	if err != nil {
		switch err {
		case service.ErrGroupNotFound:
			sendError(w, http.StatusNotFound, "Group not found")
		case service.ErrGroupFull:
			sendError(w, http.StatusConflict, "GROUP_FULL")
		case service.ErrInviteRevoked:
			sendError(w, http.StatusForbidden, "INVITE_REVOKED")
		case service.ErrInviteExpired:
			sendError(w, http.StatusGone, "INVITE_EXPIRED")
		default:
			sendError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"group":  grp,
	})
}

func (h *APIHandler) UpdateGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var req models.UpdateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}
	if len(strings.TrimSpace(req.GroupID)) == 0 {
		sendError(w, http.StatusBadRequest, "Missing groupId")
		return
	}

	if req.InviteActive != nil {
		if *req.InviteActive {
			_ = h.svc.EnableInviteLink(req.GroupID)
		} else {
			_ = h.svc.RevokeInviteLink(req.GroupID)
		}
	}
	if req.InviteExpiresAt != nil {
		_ = h.svc.SetInviteExpiration(req.GroupID, req.InviteExpiresAt)
	}

	grp, err := h.svc.GetGroup(req.GroupID)
	if err != nil {
		sendError(w, http.StatusNotFound, "Group not found")
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"group":  grp,
	})
}

func (h *APIHandler) ResetInvite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		GroupID string `json:"groupId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.GroupID) == 0 {
		sendError(w, http.StatusBadRequest, "Missing groupId")
		return
	}
	newCode, err := h.svc.ResetInviteLink(body.GroupID)
	if err != nil {
		sendError(w, http.StatusNotFound, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"code":   newCode,
	})
}

func (h *APIHandler) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		GroupID string `json:"groupId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.GroupID) == 0 {
		sendError(w, http.StatusBadRequest, "Missing groupId")
		return
	}
	if err := h.svc.RevokeInviteLink(body.GroupID); err != nil {
		sendError(w, http.StatusNotFound, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
	})
}

func (h *APIHandler) EnableInvite(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		GroupID string `json:"groupId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.GroupID) == 0 {
		sendError(w, http.StatusBadRequest, "Missing groupId")
		return
	}
	if err := h.svc.EnableInviteLink(body.GroupID); err != nil {
		sendError(w, http.StatusNotFound, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
	})
}

func (h *APIHandler) DeleteGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		GroupID string `json:"groupId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.GroupID) == 0 {
		sendError(w, http.StatusBadRequest, "Missing groupId")
		return
	}
	if err := h.svc.DeleteGroup(body.GroupID); err != nil {
		sendError(w, http.StatusNotFound, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
	})
}

func (h *APIHandler) LeaveGroup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		GroupID  string `json:"groupId"`
		UserCode string `json:"userCode"`
		UserId   string `json:"userId"`
		Nickname string `json:"nickname"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.GroupID) == 0 {
		sendError(w, http.StatusBadRequest, "Missing groupId")
		return
	}
	ident := body.UserId
	if len(ident) == 0 {
		ident = body.UserCode
	}
	if len(ident) == 0 {
		ident = body.Nickname
	}
	if err := h.svc.LeaveGroup(body.GroupID, ident); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
	})
}

func (h *APIHandler) KickMember(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	var body struct {
		GroupID        string `json:"groupId"`
		TargetNickname string `json:"targetNickname"`
		TargetUserCode string `json:"targetUserCode"`
		TargetUserId   string `json:"targetUserId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.GroupID) == 0 {
		sendError(w, http.StatusBadRequest, "Missing groupId")
		return
	}
	ident := body.TargetUserId
	if len(ident) == 0 {
		ident = body.TargetUserCode
	}
	if len(ident) == 0 {
		ident = body.TargetNickname
	}
	if err := h.svc.KickMember(body.GroupID, ident); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}
	sendJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
	})
}
