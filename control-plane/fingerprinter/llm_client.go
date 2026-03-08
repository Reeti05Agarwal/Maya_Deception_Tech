// fingerprinter/llm_client.go
package fingerprinter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type LLMClient struct {
	endpoint string
	client   *http.Client
}

type LLMAnalysis struct {
	Role                string   `json:"role"`
	HiddenServices      []string `json:"hidden_services"`
	HoneypotStrategy    string   `json:"honeypot_strategy"`
	Vulnerabilities     []string `json:"vulnerabilities"`
	DecoyContentProfile string   `json:"decoy_content_profile"`
	RecommendedOS       string   `json:"recommended_os"`
	NetworkTier         string   `json:"network_tier"`
	Explanation         string   `json:"explanation"`
}

type TopologyDesign struct {
	Segments        []SegmentDesign   `json:"segments"`
	Connections     []ConnectionRule  `json:"connections"`
	LateralPaths    [][]string        `json:"lateral_paths"`
	InternetGateway string            `json:"internet_gateway"`
	MonitoringTap   bool              `json:"monitoring_tap"`
}

type SegmentDesign struct {
	Name       string   `json:"name"`
	CIDR       string   `json:"cidr"`
	VLAN       int      `json:"vlan"`
	Honeypots  []string `json:"honeypots"`
	Purpose    string   `json:"purpose"`
}

type ConnectionRule struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Ports []int  `json:"ports"`
}

type DecoyScript struct {
	Script   string   `json:"script"`
	Profile  string   `json:"profile"`
	Services []string `json:"services"`
}

func NewLLMClient(endpoint string) *LLMClient {
	if endpoint == "" {
		endpoint = "http://localhost:8000"  // Local Python service
	}
	return &LLMClient{
		endpoint: endpoint,
		client:   &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *LLMClient) AnalyzeFingerprint(ctx context.Context, fp *FingerprintResult) (*LLMAnalysis, error) {
	payload := map[string]interface{}{
		"target_ip":   fp.TargetIP,
		"os_guess":    fp.OSGuess,
		"confidence":  fp.Confidence,
		"open_ports":  fp.OpenPorts,
		"services":    fp.Services,
		"banners":     fp.Banners,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", c.endpoint+"/analyze", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("llm request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		var errResp map[string]string
		json.NewDecoder(resp.Body).Decode(&errResp)
		return nil, fmt.Errorf("llm error %d: %s", resp.StatusCode, errResp["detail"])
	}

	var analysis LLMAnalysis
	if err := json.NewDecoder(resp.Body).Decode(&analysis); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}

	return &analysis, nil
}

func (c *LLMClient) DesignTopology(ctx context.Context, honeypots []HoneypotConfig, scenario string) (*TopologyDesign, error) {
	roles := make([]string, len(honeypots))
	services := []string{}
	
	for i, hp := range honeypots {
		roles[i] = hp.DecoyDataProfile
		for _, s := range hp.Services {
			services = append(services, string(s))
		}
	}

	payload := map[string]interface{}{
		"honeypot_count": len(honeypots),
		"scenario":       scenario,
		"roles":          roles,
		"services":       uniqueStrings(services),
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", c.endpoint+"/design-topology", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var design TopologyDesign
	if err := json.NewDecoder(resp.Body).Decode(&design); err != nil {
		return nil, fmt.Errorf("decode topology: %w", err)
	}

	return &design, nil
}

func (c *LLMClient) GenerateDecoyScript(ctx context.Context, profile string, services []ServiceType, osType string) (string, error) {
	serviceStrs := make([]string, len(services))
	for i, s := range services {
		serviceStrs[i] = string(s)
	}

	payload := map[string]interface{}{
		"profile":  profile,
		"services": serviceStrs,
		"os_type":  osType,
	}

	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", c.endpoint+"/generate-decoy", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result DecoyScript
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Script, nil
}

func (c *LLMClient) CheckHealth(ctx context.Context) (map[string]interface{}, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", c.endpoint+"/health", nil)
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

func uniqueStrings(slice []string) []string {
	seen := make(map[string]bool)
	result := []string{}
	for _, s := range slice {
		if !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	return result
}