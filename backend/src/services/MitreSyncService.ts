// Daily sync from GitHub/TAXII

// src/services/MitreSyncService.ts
import axios from 'axios';
import { MitreTechnique } from '../models/MitreTechnique';
import { MitreTactic } from '../models/MitreTactic';

interface StixObject {
  type: string;
  id: string;
  name?: string;
  description?: string;
  created?: string;
  modified?: string;
  external_references?: Array<{
    source_name: string;
    external_id?: string;
    url?: string;
  }>;
  kill_chain_phases?: Array<{
    kill_chain_name: string;
    phase_name: string;
  }>;
  x_mitre_platforms?: string[];
  x_mitre_data_sources?: string[];
  x_mitre_is_subtechnique?: boolean;
  x_mitre_detection?: string;
  x_mitre_permissions_required?: string[];
  x_mitre_effective_permissions?: string[];
  x_mitre_impact_type?: string[];
  x_mitre_contributors?: string[];
  x_mitre_version?: string;
}

export class MitreSyncService {
  private readonly GITHUB_URL = 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';
  private readonly TAXII_URL = 'https://attack-taxii.mitre.org/api/v21';
  private readonly COLLECTION_ID = 'x-mitre-collection--1f5f1533-f617-4ca8-9ab4-6a02367fa019';
  
  // Rate limiting for TAXII fallback
  private lastTaxiiRequest: Date | null = null;
  private readonly TAXII_COOLDOWN_MS = 60000; // 1 minute between requests (conservative)

  /**
   * Main sync entry point - call this from cron job
   */
  async sync(): Promise<{ success: boolean; techniquesCount: number; source: string }> {
    console.log('[MITRE Sync] Starting daily sync...');
    
    try {
      // Try GitHub first (no rate limits, always up-to-date)
      const result = await this.syncFromGitHub();
      console.log(`[MITRE Sync] GitHub sync successful: ${result.count} techniques`);
      return { success: true, techniquesCount: result.count, source: 'github' };
    } catch (githubError) {
      const githubMessage = githubError instanceof Error ? githubError.message : String(githubError);
      console.warn('[MITRE Sync] GitHub failed:', githubMessage);
      
      // Fallback to TAXII with strict rate limiting
      try {
        const result = await this.syncFromTaxii();
        console.log(`[MITRE Sync] TAXII fallback successful: ${result.count} techniques`);
        return { success: true, techniquesCount: result.count, source: 'taxii' };
      } catch (taxiiError) {
        const taxiiMessage = taxiiError instanceof Error ? taxiiError.message : String(taxiiError);
        console.error('[MITRE Sync] TAXII fallback failed:', taxiiMessage);
        throw new Error(`Both GitHub and TAXII sync failed: ${taxiiMessage}`);
      }
    }
  }

  /**
   * Sync from GitHub STIX bundle (preferred method)
   */
  private async syncFromGitHub(): Promise<{ count: number }> {
    console.log('[MITRE Sync] Fetching from GitHub...');
    
    const response = await axios.get(this.GITHUB_URL, {
      timeout: 30000,
      responseType: 'json'
    });

    if (!response.data?.objects) {
      throw new Error('Invalid STIX bundle from GitHub');
    }

    const objects: StixObject[] = response.data.objects;
    await this.processStixObjects(objects, 'github');
    
    return { count: objects.filter(o => o.type === 'attack-pattern').length };
  }

  /**
   * Sync from TAXII 2.1 (fallback only - rate limited)
   */
  private async syncFromTaxii(): Promise<{ count: number }> {
    // Strict rate limiting check
    if (this.lastTaxiiRequest) {
      const elapsed = Date.now() - this.lastTaxiiRequest.getTime();
      if (elapsed < this.TAXII_COOLDOWN_MS) {
        const waitMs = this.TAXII_COOLDOWN_MS - elapsed;
        console.log(`[MITRE Sync] Rate limit: waiting ${waitMs}ms before TAXII request...`);
        await this.sleep(waitMs);
      }
    }

    console.log('[MITRE Sync] Fetching from TAXII (fallback)...');
    
    // Update last request time BEFORE the request to prevent race conditions
    this.lastTaxiiRequest = new Date();

    const response = await axios.get(
      `${this.TAXII_URL}/collections/${this.COLLECTION_ID}/objects`,
      {
        headers: { 
          'Accept': 'application/taxii+json;version=2.1'
        },
        timeout: 30000,
        params: {
          'match[type]': 'attack-pattern,x-mitre-tactic' // Only get what we need
        }
      }
    );

    if (!response.data?.objects) {
      throw new Error('Invalid response from TAXII server');
    }

    await this.processStixObjects(response.data.objects, 'taxii');
    
    return { count: response.data.objects.filter((o: StixObject) => o.type === 'attack-pattern').length };
  }

  /**
   * Process STIX objects and store in MongoDB
   */
  private async processStixObjects(objects: StixObject[], source: 'github' | 'taxii'): Promise<void> {
    const techniques: any[] = [];
    const tactics: any[] = [];

    // First pass: extract tactics (need these for technique names)
    for (const obj of objects) {
      if (obj.type === 'x-mitre-tactic') {
        const tacticId = obj.external_references?.find(r => r.source_name === 'mitre-attack')?.external_id;
        if (tacticId) {
          tactics.push({
            tacticId,
            name: obj.name,
            shortname: obj.kill_chain_phases?.[0]?.phase_name || obj.name?.toLowerCase().replace(/\s+/g, '-'),
            description: obj.description,
            url: obj.external_references?.find(r => r.source_name === 'mitre-attack')?.url,
            order: this.getTacticOrder(tacticId)
          });
        }
      }
    }

    // Second pass: extract techniques
    for (const obj of objects) {
      if (obj.type === 'attack-pattern') {
        const techniqueId = obj.external_references?.find(r => r.source_name === 'mitre-attack')?.external_id;
        if (!techniqueId) continue;

        // Extract tactic from kill chain phases
        const tacticShortname = obj.kill_chain_phases?.find(
          kcp => kcp.kill_chain_name === 'mitre-attack'
        )?.phase_name || 'unknown';

        const tactic = tactics.find(t => t.shortname === tacticShortname);
        
        // Extract command patterns from detection description
        const commandPatterns = this.extractCommandPatterns(obj.x_mitre_detection || '');

        const technique = {
          techniqueId,
          name: obj.name,
          tactic: tacticShortname,
          tacticName: tactic?.name || tacticShortname,
          description: obj.description || '',
          platforms: obj.x_mitre_platforms || [],
          dataSources: obj.x_mitre_data_sources || [],
          isSubtechnique: obj.x_mitre_is_subtechnique || false,
          subtechniqueOf: techniqueId.includes('.') ? techniqueId.split('.')[0] : undefined,
          detection: obj.x_mitre_detection || '',
          permissionsRequired: obj.x_mitre_permissions_required || [],
          effectivePermissions: obj.x_mitre_effective_permissions || [],
          impactType: obj.x_mitre_impact_type?.[0],
          contributors: obj.x_mitre_contributors || [],
          created: obj.created ? new Date(obj.created) : undefined,
          modified: obj.modified ? new Date(obj.modified) : undefined,
          version: obj.x_mitre_version,
          lastSynced: new Date(),
          source,
          commandPatterns
        };

        techniques.push(technique);
      }
    }

    // Bulk upsert to MongoDB
    await this.bulkUpsertTechniques(techniques);
    await this.bulkUpsertTactics(tactics);

    console.log(`[MITRE Sync] Processed ${techniques.length} techniques, ${tactics.length} tactics`);
  }

  /**
   * Extract potential command patterns from detection strings
   */
  private extractCommandPatterns(detection: string): string[] {
    const patterns: string[] = [];
    
    // Common command extraction patterns
    const commandRegexes = [
      /`([^`]+)`/g,                                    // `command`
      /command[s]?:?\s*["']([^"']+)["']/gi,            // command: "cmd"
      /(?:execute|run|use)[^\w]*([a-zA-Z0-9_\-\.]+)/gi, // execute cmd
      /([a-zA-Z0-9_\-]+\.(?:exe|ps1|bat|cmd|sh))/gi,   // file.exe
    ];

    for (const regex of commandRegexes) {
      let match;
      while ((match = regex.exec(detection)) !== null) {
        const cmd = match[1].toLowerCase().trim();
        if (cmd.length > 2 && !patterns.includes(cmd)) {
          patterns.push(cmd);
        }
      }
    }

    return patterns;
  }

  /**
   * Bulk upsert techniques with error handling
   */
  private async bulkUpsertTechniques(techniques: any[]): Promise<void> {
    const operations = techniques.map(tech => ({
      updateOne: {
        filter: { techniqueId: tech.techniqueId },
        update: { $set: tech },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await MitreTechnique.bulkWrite(operations, { ordered: false });
    }
  }

  private async bulkUpsertTactics(tactics: any[]): Promise<void> {
    const operations = tactics.map(tactic => ({
      updateOne: {
        filter: { tacticId: tactic.tacticId },
        update: { $set: tactic },
        upsert: true
      }
    }));

    if (operations.length > 0) {
      await MitreTactic.bulkWrite(operations, { ordered: false });
    }
  }

  /**
   * Get display order for tactics (MITRE matrix order)
   */
  private getTacticOrder(tacticId: string): number {
    const orderMap: Record<string, number> = {
      'TA0043': 1,   // Reconnaissance
      'TA0042': 2,   // Resource Development
      'TA0001': 3,   // Initial Access
      'TA0002': 4,   // Execution
      'TA0003': 5,   // Persistence
      'TA0004': 6,   // Privilege Escalation
      'TA0005': 7,   // Defense Evasion
      'TA0006': 8,   // Credential Access
      'TA0007': 9,   // Discovery
      'TA0008': 10,  // Lateral Movement
      'TA0009': 11,  // Collection
      'TA0011': 12,  // Command and Control
      'TA0010': 13,  // Exfiltration
      'TA0040': 14   // Impact
    };
    return orderMap[tacticId] || 99;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check - verify cache is populated
   */
  async healthCheck(): Promise<{ healthy: boolean; techniqueCount: number; lastSync?: Date }> {
    const count = await MitreTechnique.countDocuments();
    const lastTech = await MitreTechnique.findOne().sort({ lastSynced: -1 });
    
    return {
      healthy: count > 0,
      techniqueCount: count,
      lastSync: lastTech?.lastSynced
    };
  }
}