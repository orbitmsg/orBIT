package main

import (
	"html/template"
	"log"
	"net/http"
)

var tmpl *template.Template

func init() {
	tmpl = template.Must(template.ParseGlob("templates/*.html"))
}

func main() {
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	routes := map[string]string{
		"/":         "index.html",
		"/donate":   "donate.html",
		"/faq":      "faq.html",
		"/privacy":  "privacy.html",
		"/terms":    "terms.html",
		"/download": "download.html",
	}

	for path, templateName := range routes {
		path := path
		templateName := templateName
		http.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != path {
				http.NotFound(w, r)
				return
			}
			err := tmpl.ExecuteTemplate(w, templateName, nil)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
		})
	}

	log.Println("Server is running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
