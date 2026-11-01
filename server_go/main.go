package main

import (
	"log"
	"net/http"
	"os"

	"orbita/groups/handlers"
	"orbita/groups/service"
)

func main() {
	port := os.Getenv("PORT")
	if len(port) == 0 {
		port = "8080"
	}

	supabaseURL := os.Getenv("GROUPS_SUPABASE_URL")
	supabaseKey := os.Getenv("GROUPS_SUPABASE_KEY")
	backend := service.NewSupabaseBackend(supabaseURL, supabaseKey)
	groupSvc := service.NewGroupService(backend)
	apiHandler := handlers.NewAPIHandler(groupSvc)

	mux := http.NewServeMux()
	apiHandler.RegisterRoutes(mux)

	log.Printf("Orbita Go Group Service running on port %s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
