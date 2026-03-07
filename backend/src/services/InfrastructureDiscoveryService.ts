import { exec } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type DiscoveredVmStatus = 'running' | 'stopped' | 'unknown';

export interface DiscoveredVm {
  name: string;
  status: DiscoveredVmStatus;
  lastSeen: string;
}

export class InfrastructureDiscoveryService {
  private async resolveFakeRoot(): Promise<string> {
    const candidates = [
      process.env.VAGRANT_DIR ? path.resolve(process.env.VAGRANT_DIR) : undefined,
      path.resolve(process.cwd(), '../simulations/fake'),
      path.resolve(process.cwd(), 'simulations/fake')
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // Try next candidate.
      }
    }

    throw new Error('Unable to resolve simulations/fake directory for VM discovery');
  }

  async discoverVMs(): Promise<DiscoveredVm[]> {
    const root = await this.resolveFakeRoot();
    const entries = await fs.readdir(root, { withFileTypes: true });
    const vms: DiscoveredVm[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const vmPath = path.join(root, entry.name);
      const stat = await fs.stat(vmPath);
      if (!stat.isDirectory()) continue;

      const vagrantfile = path.join(vmPath, 'Vagrantfile');
      try {
        await fs.access(vagrantfile);
      } catch {
        continue;
      }

      const status = await this.getVmStatus(entry.name, vmPath);
      vms.push({
        name: entry.name,
        status,
        lastSeen: new Date().toISOString()
      });
    }

    return vms.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (a.status !== 'running' && b.status === 'running') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async getVmStatus(vmName: string, vmPath?: string): Promise<DiscoveredVmStatus> {
    const normalized = String(vmName || '').trim();
    if (!normalized) return 'unknown';

    const candidates = [normalized, `${normalized}_default`];
    for (const candidate of candidates) {
      try {
        const { stdout } = await execAsync(
          `timeout 8 virsh -c qemu:///system domstate ${this.shellQuote(candidate)} 2>/dev/null`,
          { timeout: 10000, maxBuffer: 1024 * 1024 }
        );
        const state = stdout.trim().toLowerCase();
        if (state.includes('running') || state.includes('paused') || state.includes('blocked')) {
          return 'running';
        }
        if (state.includes('shut') || state.includes('off') || state.includes('crashed') || state.includes('pmsuspended')) {
          return 'stopped';
        }
      } catch {
        // Try next candidate/fallback.
      }
    }

    if (vmPath) {
      try {
        const cmd = [
          `cd ${this.shellQuote(vmPath)}`,
          'timeout 8 vagrant status --machine-readable 2>/dev/null || echo ""'
        ].join(' && ');
        const { stdout } = await execAsync(cmd, { timeout: 10000, maxBuffer: 1024 * 1024 });
        if (stdout.includes('state-running,running')) return 'running';
        if (stdout.includes(',state,')) return 'stopped';
      } catch {
        // Fall through to unknown.
      }
    }

    return 'unknown';
  }

  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
}
