package invite

import (
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	hashRegex      = regexp.MustCompile(`(?i)#([a-zA-Z0-9_-]{6,64})`)
	directRegex    = regexp.MustCompile(`(?i)(join_[a-zA-Z0-9_-]{6,32})`)
	slashRegex     = regexp.MustCompile(`(?i)orbita\/(join_[a-zA-Z0-9_-]{6,32})`)
	urlPathRegex   = regexp.MustCompile(`(?i)\/(?:g|group|groups|join|invite)(?:\/group)?\/([a-zA-Z0-9_-]{6,64})`)
	queryRegex     = regexp.MustCompile(`(?i)[?&](?:group|code|token)=([a-zA-Z0-9_-]{6,64})`)
	deepLinkRegex  = regexp.MustCompile(`(?i)orbita:\/\/(?:group|groups|join|invite)(?:\/group)?\/([a-zA-Z0-9_-]{6,64})`)
	deepParamRegex = regexp.MustCompile(`(?i)orbita:\/\/(?:group|groups|join|invite)(?:\/group)?\?(?:code|token|group)=([a-zA-Z0-9_-]{6,64})`)
	alphanumeric   = regexp.MustCompile(`^[0-9A-Za-z_-]{6,64}$`)
)

func BuildGroupInviteLink(baseURL, groupCode string) string {
	cleaned := strings.TrimSpace(groupCode)
	if len(cleaned) == 0 {
		return ""
	}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if len(base) == 0 {
		base = "https://orbitad.vercel.app"
	}
	return base + "/groups/#" + url.QueryEscape(cleaned)
}

func ExtractGroupCode(input string) string {
	trimmed := strings.TrimSpace(input)
	if len(trimmed) == 0 {
		return ""
	}

	if m := hashRegex.FindStringSubmatch(trimmed); len(m) > 1 {
		return m[1]
	}
	if m := directRegex.FindStringSubmatch(trimmed); len(m) > 1 {
		return m[1]
	}
	if m := slashRegex.FindStringSubmatch(trimmed); len(m) > 1 {
		return m[1]
	}
	if m := urlPathRegex.FindStringSubmatch(trimmed); len(m) > 1 {
		return m[1]
	}
	if m := queryRegex.FindStringSubmatch(trimmed); len(m) > 1 {
		return m[1]
	}
	if m := deepLinkRegex.FindStringSubmatch(trimmed); len(m) > 1 {
		return m[1]
	}
	if m := deepParamRegex.FindStringSubmatch(trimmed); len(m) > 1 {
		return m[1]
	}
	if strings.HasPrefix(trimmed, "#") {
		clean := strings.TrimLeft(trimmed, "#")
		if alphanumeric.MatchString(clean) {
			return clean
		}
	}
	if alphanumeric.MatchString(trimmed) {
		return trimmed
	}

	return ""
}

func CheckInviteStatus(inviteActive bool, expiresAt *int64, nowMs int64) (bool, string) {
	if !inviteActive {
		return false, "INVITE_REVOKED"
	}
	if expiresAt != nil && *expiresAt > 0 {
		current := nowMs
		if current <= 0 {
			current = time.Now().UnixMilli()
		}
		if current > *expiresAt {
			return false, "INVITE_EXPIRED"
		}
	}
	return true, ""
}
