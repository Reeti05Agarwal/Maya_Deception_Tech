// fingerprinter/fingerprinter.go
package fingerprinter

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/Ullaakut/nmap/v3"
)

type OSType string

const (
	OSDebian  OSType = "debian"
	OSUbuntu  OSType = "ubuntu"
	OSAlpine  OSType = "alpine"
	OSCentOS  OSType = "centos"
	OSWindows OSType = "windows"
)

type ServiceType string

const (
	ServiceSSH      ServiceType = "ssh"
	ServiceFTP      ServiceType = "ftp"
	ServiceSMB      ServiceType = "smb"
	ServiceRDP      ServiceType = "rdp"
	ServiceHTTP     ServiceType = "http"
	ServiceDatabase ServiceType = "database"
)

type FingerprintResult struct {
	TargetIP       string                  `json:"target_ip"`
	OSGuess        OSType                  `json:"os_guess"`
	Confidence     float64                 `json:"confidence"`
	OpenPorts      []int                   `json:"open_ports"`
	Services       map[int]ServiceType     `json:"services"`
	Banners        map[int]string          `json:"banners"`
	TTL            int                     `json:"ttl"`
	MACVendor      string                  `json:"mac_vendor,omitempty"`
	NetworkDistance int                    `json:"network_distance"`
}

type Engine struct {
	nmapScanner *nmap.Scanner
	llmClient   LLMClient  // Interface to Python LLM service
}

func New(nmapPath string, llmEndpoint string) (*Engine, error) {
	scanner, err := nmap.NewScanner(
		nmap.WithBinaryPath(nmapPath),
	)
	if err != nil {
		return nil, fmt.Errorf("nmap init failed: %w", err)
	}

	return &Engine{
		nmapScanner: scanner,
		llmClient:   NewLLMClient(llmEndpoint),
	}, nil
}

func (e *Engine) Scan(ctx context.Context, target string) (*FingerprintResult, error) {
	// Run nmap with service detection
	result, warnings, err := e.nmapScanner.Scan(
		ctx,
		target,
		nmap.WithServiceInfo(),
		nmap.WithOSDetection(),
		nmap.WithTimingTemplate(nmap.TimingAggressive),
	)
	if err != nil {
		return nil, fmt.Errorf("scan failed: %w", err)
	}
	if warnings != nil {
		// Log warnings
	}

	// Parse results
	fp := &FingerprintResult{
		TargetIP:   target,
		Services:   make(map[int]ServiceType),
		Banners:    make(map[int]string),
		OpenPorts:  []int{},
	}

	for _, host := range result.Hosts {
		if host.Status.State != "up" {
			continue
		}

		// OS detection
		if len(host.OS.Matches) > 0 {
			fp.OSGuess = normalizeOS(host.OS.Matches[0].Name)
			fp.Confidence = float64(host.OS.Matches[0].Accuracy) / 100
		}

		// Port services
		for _, port := range host.Ports {
			if port.State.State == "open" {
				fp.OpenPorts = append(fp.OpenPorts, port.ID)
				fp.Services[port.ID] = normalizeService(port.Service.Name)
				fp.Banners[port.ID] = port.Service.Version
			}
		}

		// MAC vendor
		for _, addr := range host.Addresses {
			if addr.AddrType == "mac" {
				fp.MACVendor = addr.Vendor
			}
		}
	}

	return fp, nil
}

func (e *Engine) EnhanceWithLLM(ctx context.Context, fp *FingerprintResult) (*LLMAnalysis, error) {
	return e.llmClient.AnalyzeFingerprint(ctx, fp)
}