// generator/vagrant.go
package generator

import (
	"bytes"
	"embed"
	"fmt"
	"text/template"
	"time"
)

//go:embed templates/*.tmpl
var templateFS embed.FS

type HoneypotConfig struct {
	Name              string
	OS                string
	VagrantBox        string
	Services          []string
	NetworkTier       string
	MemoryMB          int
	CPUCores          int
	DiskGB            int
	DecoyDataProfile  string
	IP                string
	Peers             []string
}

type Generator struct {
	tmpl *template.Template
}

func New() (*Generator, error) {
	tmpl, err := template.ParseFS(templateFS, "templates/*.tmpl")
	if err != nil {
		return nil, fmt.Errorf("parse templates: %w", err)
	}

	// Add template functions
	tmpl = tmpl.Funcs(template.FuncMap{
		"now": time.Now,
		"join": func(sep string, items []string) string {
			return strings.Join(items, sep)
		},
	})

	return &Generator{tmpl: tmpl}, nil
}

func (g *Generator) GenerateVagrantfile(configs []HoneypotConfig, topology *Topology) (string, error) {
	data := struct {
		Configs   []HoneypotConfig
		Topology  *Topology
		Timestamp time.Time
	}{
		Configs:   configs,
		Topology:  topology,
		Timestamp: time.Now(),
	}

	var buf bytes.Buffer
	if err := g.tmpl.ExecuteTemplate(&buf, "Vagrantfile.tmpl", data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}

	return buf.String(), nil
}