package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type PreviewResponse struct {
	HasPreview  bool   `json:"has_preview"`
	URL         string `json:"url,omitempty"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	SiteName    string `json:"site_name,omitempty"`
}

var (
	ogTitleRegex       = regexp.MustCompile(`(?i)<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title|title)["'][^>]+content=["']([^"']+)["']`)
	ogTitleRevRegex    = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title|title)["']`)
	htmlTitleRegex     = regexp.MustCompile(`(?i)<title[^>]*>([^<]+)</title>`)
	ogDescRegex        = regexp.MustCompile(`(?i)<meta[^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["'][^>]+content=["']([^"']+)["']`)
	ogDescRevRegex     = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|twitter:description|description)["']`)
	ogImageRegex       = regexp.MustCompile(`(?i)<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["'][^>]+content=["']([^"']+)["']`)
	ogImageRevRegex    = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["']`)
	ogSiteNameRegex    = regexp.MustCompile(`(?i)<meta[^>]+(?:property|name)=["'](?:og:site_name|application-name)["'][^>]+content=["']([^"']+)["']`)
	ogSiteNameRevRegex = regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:site_name|application-name)["']`)
)

func (h *APIHandler) HandlePreview(w http.ResponseWriter, r *http.Request) {
	targetURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if targetURL == "" {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(PreviewResponse{HasPreview: false})
		return
	}

	lower := strings.ToLower(targetURL)
	if strings.Contains(lower, "orbitachat.vercel.app") ||
		strings.Contains(lower, "orbitad.vercel.app") ||
		strings.Contains(lower, "orbita.workers.dev") ||
		strings.Contains(lower, "/groups/#") ||
		strings.Contains(lower, "/groups/") ||
		strings.Contains(lower, "localhost") ||
		strings.Contains(lower, "127.0.0.1") {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(PreviewResponse{HasPreview: false})
		return
	}

	parsed, err := url.Parse(targetURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(PreviewResponse{HasPreview: false})
		return
	}

	client := &http.Client{
		Timeout: 2500 * time.Millisecond,
	}

	req, err := http.NewRequestWithContext(r.Context(), "GET", targetURL, nil)
	if err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(PreviewResponse{HasPreview: false})
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Orbita/2.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode >= 400 {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(PreviewResponse{HasPreview: false})
		return
	}
	defer resp.Body.Close()

	limitReader := io.LimitReader(resp.Body, 65536)
	bodyBytes, err := io.ReadAll(limitReader)
	if err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(PreviewResponse{HasPreview: false})
		return
	}

	htmlContent := string(bodyBytes)
	title := extractRegex(htmlContent, ogTitleRegex, ogTitleRevRegex, htmlTitleRegex)
	desc := extractRegex(htmlContent, ogDescRegex, ogDescRevRegex)
	img := extractRegex(htmlContent, ogImageRegex, ogImageRevRegex)
	site := extractRegex(htmlContent, ogSiteNameRegex, ogSiteNameRevRegex)

	if site == "" {
		site = strings.TrimPrefix(parsed.Hostname(), "www.")
	}

	if img != "" && !strings.HasPrefix(img, "http://") && !strings.HasPrefix(img, "https://") && !strings.HasPrefix(img, "data:") {
		if resolved, err := parsed.Parse(img); err == nil {
			img = resolved.String()
		}
	}

	hasImage := strings.TrimSpace(img) != ""
	hasRichDesc := len(strings.TrimSpace(desc)) > 10

	if !hasImage && !hasRichDesc {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(PreviewResponse{HasPreview: false})
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(PreviewResponse{
		HasPreview:  true,
		URL:         targetURL,
		Title:       title,
		Description: desc,
		Image:       img,
		SiteName:    site,
	})
}

func extractRegex(content string, regexes ...*regexp.Regexp) string {
	for _, re := range regexes {
		m := re.FindStringSubmatch(content)
		if len(m) > 1 && strings.TrimSpace(m[1]) != "" {
			return strings.TrimSpace(m[1])
		}
	}
	return ""
}
