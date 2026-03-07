// topology/designer.go
package topology

import (
	"context"
	"fmt"
	"net"

	"github.com/apparentlymart/go-cidr/cidr"
)

type Segment struct {
	Name            string
	CIDR            string
	VLANID          int
	Purpose         string
	AllowedInbound  []string
	AllowedOutbound []string
	NATEnabled      bool
	Honeypots       []HoneypotRef
}

type Topology struct {
	Name           string
	Segments       []Segment
	RoutingRules   []RoutingRule
	InternetGateway string
}

type RoutingRule struct {
	From  string
	To    string
	Ports []int
}

type Designer struct {
	llmEndpoint string
}

func NewDesigner(llmEndpoint string) *Designer {
	return &Designer{llmEndpoint: llmEndpoint}
}

func (d *Designer) Design(ctx context.Context, honeypots []HoneypotConfig, scenario string) (*Topology, error) {
	// Call Python LLM service for high-level design
	design, err := d.callLLMForTopology(ctx, honeypots, scenario)
	if err != nil {
		return nil, fmt.Errorf("llm design failed: %w", err)
	}

	// Validate and assign concrete network values
	topology := &Topology{
		Name:            fmt.Sprintf("honeynet-%s", time.Now().Format("20060102")),
		InternetGateway: "dmz",
	}

	baseNet := net.IPNet{IP: net.ParseIP("10.10.0.0"), Mask: net.CIDRMask(16, 32)}

	for i, segDesign := range design.Segments {
		// Calculate subnet
		subnet, _ := cidr.Subnet(&baseNet, 8, i) // /24 subnets

		seg := Segment{
			Name:       segDesign.Name,
			CIDR:       subnet.String(),
			VLANID:     10 + i*10,
			Purpose:    segDesign.Name,
			NATEnabled: segDesign.Name == "dmz",
		}

		// Assign honeypots to this segment
		for _, hpName := range segDesign.Honeypots {
			for _, hp := range honeypots {
				if hp.Name == hpName {
					// Calculate IP in subnet
					ip, _ := cidr.Host(subnet, 100+len(seg.Honeypots))
					seg.Honeypots = append(seg.Honeypots, HoneypotRef{
						Name: hp.Name,
						IP:   ip.String(),
					})
				}
			}
		}

		topology.Segments = append(topology.Segments, seg)
	}

	// Convert LLM routing suggestions to concrete rules
	for _, conn := range design.Connections {
		topology.RoutingRules = append(topology.RoutingRules, RoutingRule{
			From:  conn.From,
			To:    conn.To,
			Ports: conn.Ports,
		})
	}

	return topology, nil
}