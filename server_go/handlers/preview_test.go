package handlers

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestHandlePreviewBlockedURLs(t *testing.T) {
	handler := &APIHandler{}
	blocked := []string{
		"https://orbitachat.vercel.app/groups/#i93jwcitpojr37mgk5orhv2gcda02uxj",
		"https://orbitad.vercel.app/invite",
		"https://orbita.workers.dev/groups/join",
		"http://localhost:8080/test",
		"",
	}

	for _, u := range blocked {
		req := httptest.NewRequest("GET", "/api/preview?url="+u, nil)
		rec := httptest.NewRecorder()
		handler.HandlePreview(rec, req)

		var resp PreviewResponse
		if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}
		if resp.HasPreview {
			t.Errorf("Expected HasPreview=false for %s, got true", u)
		}
	}
}
