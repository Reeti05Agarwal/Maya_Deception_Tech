// Main service for classification

// src/services/MitreAttackService.ts
import { MitreTechnique } from '../models/MitreTechnique';
import { MitreTactic } from '../models/MitreTactic';
import { classifyCommand } from '../utils/commandPatterns';
import { logger } from '../utils/logger';

interface AttackEventInput {
  command: string;
  timestamp: Date;
  severity?: string;
  attackerId?: string;
}

interface ClassifiedEvent {
  techniqueId: string;
  techniqueName: string;
  tactic: string;
  tacticId: string;
  tacticName: string;
  confidence: number;
  method: string;
  isSubtechnique: boolean;
  allMatches: string[];
}

/**
 * Default fallback classification for unknown commands
 * Returns a generic "Discovery" technique as the safest default
 */
function getDefaultClassification(): ClassifiedEvent {
  return {
    techniqueId: 'T1082',
    techniqueName: 'System Information Discovery',
    tactic: 'discovery',
    tacticId: 'TA0007',
    tacticName: 'Discovery',
    confidence: 0.3,
    method: 'unknown',  // Use 'unknown' instead of 'fallback' (matches schema enum)
    isSubtechnique: false,
    allMatches: ['T1082']
  };
}

export class MitreAttackService {

  /**
   * Classify a single attack event
   * Returns a default classification if no match is found (never returns null)
   */
  async classifyEvent(command: string): Promise<ClassifiedEvent> {
    try {
      const classification = await classifyCommand(command);

      if (!classification.primary) {
        // No match found - return default classification instead of null
        logger.debug(`No MITRE match for command: ${command.substring(0, 50)}..., using fallback`);
        return getDefaultClassification();
      }

      const tech = await MitreTechnique.findOne({
        techniqueId: classification.primary.techniqueId
      });

      if (!tech) {
        // Technique not in database - return classification with basic info
        logger.debug(`Technique ${classification.primary.techniqueId} not in database, using basic info`);
        return {
          techniqueId: classification.primary.techniqueId,
          techniqueName: `Technique ${classification.primary.techniqueId}`,
          tactic: 'discovery',
          tacticId: 'TA0007',
          tacticName: 'Discovery',
          confidence: classification.primary.confidence,
          method: classification.primary.method,
          isSubtechnique: false,
          allMatches: classification.allMatches.map(m => m.techniqueId)
        };
      }

      const tactic = await MitreTactic.findOne({ shortname: tech.tactic });

      return {
        techniqueId: tech.techniqueId,
        techniqueName: tech.name,
        tactic: tech.tactic,
        tacticId: tactic?.tacticId || 'TA0007',
        tacticName: tactic?.name || 'Discovery',
        confidence: classification.primary.confidence,
        method: classification.primary.method,
        isSubtechnique: tech.isSubtechnique,
        allMatches: classification.allMatches.map(m => m.techniqueId)
      };
    } catch (error) {
      // On any error, return default classification
      logger.error('Classification error:', error);
      return getDefaultClassification();
    }
  }
  
  /**
   * Build full ATT&CK matrix for an attacker's events
   */
  async buildAttackMatrix(events: AttackEventInput[]): Promise<{
    tactic: string;
    tacticId: string;
    techniques: Array<{
      id: string;
      name: string;
      count: number;
      firstSeen: Date;
      lastSeen: Date;
      confidence: number;
    }>;
  }[]> {
    const tacticMap = new Map<string, {
      tacticId: string;
      techniques: Map<string, {
        name: string;
        count: number;
        firstSeen: Date;
        lastSeen: Date;
        confidenceSum: number;
      }>;
    }>();
    
    for (const event of events) {
      const classified = await this.classifyEvent(event.command);
      // classified is never null now due to fallback

      if (!tacticMap.has(classified.tactic)) {
        tacticMap.set(classified.tactic, {
          tacticId: classified.tacticId,
          techniques: new Map()
        });
      }
      
      const tacticData = tacticMap.get(classified.tactic)!;
      const techKey = classified.techniqueId;
      
      if (!tacticData.techniques.has(techKey)) {
        tacticData.techniques.set(techKey, {
          name: classified.techniqueName,
          count: 0,
          firstSeen: event.timestamp,
          lastSeen: event.timestamp,
          confidenceSum: 0
        });
      }
      
      const techData = tacticData.techniques.get(techKey)!;
      techData.count++;
      techData.confidenceSum += classified.confidence;
      
      if (event.timestamp < techData.firstSeen) techData.firstSeen = event.timestamp;
      if (event.timestamp > techData.lastSeen) techData.lastSeen = event.timestamp;
    }
    
    // Get tactic order for sorting
    const tacticOrder = await this.getTacticOrderMap();
    
    // Convert to array and sort
    const result = Array.from(tacticMap.entries()).map(([tactic, data]) => ({
      tactic,
      tacticId: data.tacticId,
      techniques: Array.from(data.techniques.entries()).map(([id, tech]) => ({
        id,
        name: tech.name,
        count: tech.count,
        firstSeen: tech.firstSeen,
        lastSeen: tech.lastSeen,
        confidence: Math.round((tech.confidenceSum / tech.count) * 100) / 100
      })).sort((a, b) => b.count - a.count)
    })).sort((a, b) => {
      const orderA = tacticOrder.get(a.tactic) || 99;
      const orderB = tacticOrder.get(b.tactic) || 99;
      return orderA - orderB;
    });
    
    return result;
  }
  
  /**
   * Generate ATT&CK Navigator layer JSON
   */
  async generateNavigatorLayer(events: AttackEventInput[], options: {
    name?: string;
    description?: string;
  } = {}): Promise<object> {
    const techniqueScores = new Map<string, {
      score: number;
      count: number;
      commands: Set<string>;
    }>();
    
    for (const event of events) {
      const classified = await this.classifyEvent(event.command);
      // classified is never null now due to fallback

      const id = classified.techniqueId;
      if (!techniqueScores.has(id)) {
        techniqueScores.set(id, { score: 0, count: 0, commands: new Set() });
      }
      
      const data = techniqueScores.get(id)!;
      // Score based on confidence and severity
      const severityMultiplier = event.severity === 'Critical' ? 3 : 
                                  event.severity === 'High' ? 2 : 1;
      data.score += classified.confidence * severityMultiplier * 10;
      data.count++;
      data.commands.add(event.command.substring(0, 50)); // Truncate long commands
    }
    
    // Get tactic info for metadata
    const tactics = await MitreTactic.find().sort({ order: 1 });
    
    return {
      name: options.name || 'Honeypot Detection Layer',
      description: options.description || `Generated from ${events.length} events`,
      versions: {
        attack: '17',
        navigator: '4.9.1',
        layer: '4.5'
      },
      domain: 'enterprise-attack',
      techniques: Array.from(techniqueScores.entries()).map(([id, data]) => ({
        techniqueID: id,
        score: Math.min(Math.round(data.score), 100),
        comment: `${data.count} events: ${Array.from(data.commands).slice(0, 3).join(', ')}${data.commands.size > 3 ? '...' : ''}`
      })),
      gradient: {
        colors: ['#ffffff', '#ffcc00', '#ff0000'],
        minValue: 0,
        maxValue: 100
      },
      metadata: {
        tactics: tactics.map(t => t.shortname)
      }
    };
  }
  
  /**
   * Get technique details with related techniques
   */
  async getTechniqueDetails(techniqueId: string): Promise<{
    technique: any;
    subtechniques: any[];
    parentTechnique?: any;
  } | null> {
    const technique = await MitreTechnique.findOne({ techniqueId });
    if (!technique) return null;
    
    const result: any = { technique, subtechniques: [] };
    
    if (technique.isSubtechnique && technique.subtechniqueOf) {
      result.parentTechnique = await MitreTechnique.findOne({ 
        techniqueId: technique.subtechniqueOf 
      });
    } else {
      result.subtechniques = await MitreTechnique.find({ 
        subtechniqueOf: techniqueId 
      }).sort({ techniqueId: 1 });
    }
    
    return result;
  }
  
  /**
   * Search techniques by keyword
   */
  async searchTechniques(query: string): Promise<any[]> {
    return MitreTechnique.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(10);
  }
  
  /**
   * Get statistics about the cached data
   */
  async getStats(): Promise<{
    totalTechniques: number;
    totalTactics: number;
    subtechniques: number;
    topPlatforms: Array<{ platform: string; count: number }>;
    lastSync: Date | null;
  }> {
    const [totalTechniques, totalTactics, subtechniques] = await Promise.all([
      MitreTechnique.countDocuments(),
      MitreTactic.countDocuments(),
      MitreTechnique.countDocuments({ isSubtechnique: true })
    ]);
    
    const platformStats = await MitreTechnique.aggregate([
      { $unwind: '$platforms' },
      { $group: { _id: '$platforms', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    const lastTech = await MitreTechnique.findOne().sort({ lastSynced: -1 });
    
    return {
      totalTechniques,
      totalTactics,
      subtechniques,
      topPlatforms: platformStats.map(p => ({ platform: p._id, count: p.count })),
      lastSync: lastTech?.lastSynced || null
    };
  }
  
  private async getTacticOrderMap(): Promise<Map<string, number>> {
    const tactics = await MitreTactic.find().select('shortname order');
    const map = new Map<string, number>();
    tactics.forEach(t => map.set(t.shortname, t.order));
    return map;
  }
}