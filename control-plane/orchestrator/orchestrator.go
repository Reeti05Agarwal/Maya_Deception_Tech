// orchestrator/orchestrator.go
package orchestrator

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"golang.org/x/sync/errgroup"
)

type Orchestrator struct {
	baseDir string
}

func New(baseDir string) *Orchestrator {
	return &Orchestrator{baseDir: baseDir}
}

type Deployment struct {
	Dir       string
	Topology  *topology.Topology
	VMs       []VMStatus
}

func (o *Orchestrator) CreateDeployment(ctx context.Context, topo *topology.Topology, configs []generator.HoneypotConfig) (*Deployment, error) {
	dir := filepath.Join(o.baseDir, topo.Name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("create dir: %w", err)
	}

	// Generate Vagrantfile
	gen, _ := generator.New()
	vagrantfile, err := gen.GenerateVagrantfile(configs, topo)
	if err != nil {
		return nil, fmt.Errorf("generate vagrantfile: %w", err)
	}

	vfPath := filepath.Join(dir, "Vagrantfile")
	if err := os.WriteFile(vfPath, []byte(vagrantfile), 0644); err != nil {
		return nil, fmt.Errorf("write vagrantfile: %w", err)
	}

	// Generate network config for Go networking layer
	netConfig := o.generateNetworkConfig(topo)
	netPath := filepath.Join(dir, "network.json")
	if err := os.WriteFile(netPath, netConfig, 0644); err != nil {
		return nil, err
	}

	// Generate peer config for Rust CRDT
	peers := o.generatePeerList(topo)
	peerPath := filepath.Join(dir, "peers.txt")
	if err := os.WriteFile(peerPath, []byte(peers), 0644); err != nil {
		return nil, err
	}

	return &Deployment{
		Dir:      dir,
		Topology: topo,
	}, nil
}

func (o *Orchestrator) Deploy(ctx context.Context, dep *Deployment) error {
	g, ctx := errgroup.WithContext(ctx)

	// Start VMs in parallel by tier (DMZ first, then internal, etc.)
	tiers := []string{"dmz", "internal", "secure", "management"}
	
	for _, tier := range tiers {
		tier := tier // capture
		g.Go(func() error {
			return o.deployTier(ctx, dep, tier)
		})
	}

	if err := g.Wait(); err != nil {
		return fmt.Errorf("deployment failed: %w", err)
	}

	// Configure inter-VM networking (Go networking layer)
	if err := o.configureNetworking(ctx, dep); err != nil {
		return fmt.Errorf("network config failed: %w", err)
	}

	return nil
}

func (o *Orchestrator) deployTier(ctx context.Context, dep *Deployment, tier string) error {
	// Get VMs in this tier
	var vms []string
	for _, seg := range dep.Topology.Segments {
		if seg.Purpose == tier {
			for _, hp := range seg.Honeypots {
				vms = append(vms, hp.Name)
			}
		}
	}

	// Parallel vagrant up for this tier
	var wg sync.WaitGroup
	errChan := make(chan error, len(vms))

	for _, vm := range vms {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			
			cmd := exec.CommandContext(ctx, "vagrant", "up", name)
			cmd.Dir = dep.Dir
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			
			if err := cmd.Run(); err != nil {
				errChan <- fmt.Errorf("vm %s: %w", name, err)
			}
		}(vm)
	}

	wg.Wait()
	close(errChan)

	for err := range errChan {
		if err != nil {
			return err
		}
	}

	return nil
}

func (o *Orchestrator) configureNetworking(ctx context.Context, dep *Deployment) error {
	// Use Go networking code to:
	// 1. Create Linux bridges/VLANs
	// 2. Configure iptables rules between segments
	// 3. Set up traffic mirroring to IDS
	// 4. Configure CRDT mesh (populate peer lists on each VM)
	
	return nil
}