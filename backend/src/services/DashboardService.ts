import { Attacker, AttackEvent, Credential, DecoyHost, LateralMovement, VMStatus } from '../models';
import moment from 'moment';
import { mapToAttackerSummary, mapToDashboardData } from './AttackerMapper';

export class DashboardService {
  
  async getDashboardStats() {
    const [
      activeAttackers,
      totalEvents,
      stolenCredentials,
      compromisedHosts,
      avgDwellTime,
      blockedAttacks
    ] = await Promise.all([
      Attacker.countDocuments({ status: 'Active' }),
      AttackEvent.countDocuments(),
      Credential.countDocuments(),
      DecoyHost.countDocuments({ status: { $in: ['Compromised', 'Under Attack'] } }),
      this.calculateAverageDwellTime(),
      AttackEvent.countDocuments({ status: { $in: ['Blocked', 'Contained'] } })
    ]);

    const [totalHosts, securityPosture] = await Promise.all([
      DecoyHost.countDocuments(),
      this.getSecurityPostureScore()
    ]);
    const engagementRate = totalHosts > 0 ? (compromisedHosts / totalHosts) * 100 : 0;
    const totalDwellTime = await this.calculateTotalDwellTime();

    return {
      activeAttackers,
      deceptionEngagement: {
        rate: Math.round(engagementRate),
        level: engagementRate > 70 ? 'High' : engagementRate > 40 ? 'Medium' : 'Low'
      },
      dwellTime: {
        hours: Math.floor(totalDwellTime),
        minutes: Math.round((totalDwellTime % 1) * 60),
        average: Math.round(avgDwellTime)
      },
      realAssetsProtected: 15,
      metrics: {
        totalEvents,
        stolenCredentials,
        compromisedHosts,
        blockedAttacks,
        falsePositives: 0
      },
      securityPosture
    };
  }
  async getMappedActiveAttackers() {
    const attackers = await Attacker.find({ status: 'Active' })
      .sort({ lastSeen: -1 })
      .limit(20)
      .lean();
    
    return attackers.map((a: any) => mapToAttackerSummary(a));
  }
  async getAttackerDashboard(attackerId: string) {
    const attacker = await Attacker.findOne({ attackerId }).lean();
    if (!attacker) return null;
    
    const dashboard = await mapToDashboardData(attacker);
    
    return {
      id: attacker.attackerId,
      attackerId: attacker.attackerId,
      generatedAt: new Date().toISOString(),
      dashboard,
    };
  }

  async getAttackerProfile(attackerId: string) {
    const attacker = await Attacker.findOne({ attackerId }).lean();
    if (!attacker) return null;

    const [credentials, recentEvents, movements] = await Promise.all([
      Credential.find({ attackerId }).sort({ timestamp: -1 }).limit(10).lean(),
      AttackEvent.find({ attackerId }).sort({ timestamp: -1 }).limit(5).lean(),
      LateralMovement.find({ attackerId }).sort({ timestamp: -1 }).lean()
    ]);

    return {
      attackerId: attacker.attackerId,
      ipAddress: attacker.ipAddress,
      entryPoint: attacker.entryPoint,
      currentPrivilege: attacker.currentPrivilege,
      riskLevel: attacker.riskLevel,
      campaign: attacker.campaign,
      firstSeen: attacker.firstSeen,
      lastSeen: attacker.lastSeen,
      dwellTime: this.formatDwellTime(attacker.dwellTime),
      status: attacker.status,
      geolocation: attacker.geolocation,
      fingerprint: attacker.fingerprint,
      credentials: credentials.map(c => ({
        username: c.username,
        source: c.source,
        timestamp: c.timestamp,
        riskScore: c.riskScore
      })),
      recentEvents: recentEvents.map(e => ({
        type: e.type,
        timestamp: e.timestamp,
        description: e.description
      })),
      lateralMovement: movements.map(m => ({
        from: m.sourceHost,
        to: m.targetHost,
        method: m.method,
        successful: m.successful
      }))
    };
  }

  async getAttackTimeline(attackerId?: string, hours = 24, limit = 100) {
    const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;
    const query: any = { timestamp: { $gte: moment().subtract(safeHours, 'hours').toDate() } };
    if (attackerId) query.attackerId = attackerId;
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;

    const events = await AttackEvent.find(query).sort({ timestamp: 1 }).limit(safeLimit).lean();

    return events.map(e => ({
      eventId: e.eventId,
      timestamp: e.timestamp,
      time: moment(e.timestamp).format('HH:mm:ss'),
      stage: e.stage || this.mapStageFromType(e.type, e.description),
      type: e.type,
      technique: e.technique,
      description: e.description,
      severity: e.severity,
      status: e.status,
      sourceHost: e.sourceHost,
      targetHost: e.targetHost,
      attackerId: e.attackerId,
      label: this.formatStageLabel(e.stage || this.mapStageFromType(e.type, e.description)),
      detail: e.description
    }));
  }

  async getMitreMatrix(attackerId?: string) {
    const tactics = [
      'Initial Access', 'Execution', 'Persistence', 'Privilege Escalation',
      'Defense Evasion', 'Credential Access', 'Discovery', 'Lateral Movement',
      'Collection', 'Command and Control', 'Exfiltration', 'Impact'
    ];

    const query: any = {};
    if (attackerId) query.attackerId = attackerId;

    const events = await AttackEvent.find(query).lean();
    
    const matrix: any = {};
    tactics.forEach(tactic => {
      matrix[tactic] = { techniques: [], coverage: 0, color: 'none' };
    });

    events.forEach(event => {
      if (matrix[event.tactic]) {
        const existing = matrix[event.tactic].techniques.find((t: any) => t.id === event.technique);
        if (!existing) {
          matrix[event.tactic].techniques.push({
            id: event.technique,
            name: event.description.split(':')[0] || event.description,
            count: 1,
            severity: event.severity
          });
        } else {
          existing.count++;
        }
      }
    });

    Object.keys(matrix).forEach(tactic => {
      const techniqueCount = matrix[tactic].techniques.length;
      matrix[tactic].coverage = techniqueCount;
      if (techniqueCount === 0) matrix[tactic].color = 'none';
      else if (techniqueCount <= 2) matrix[tactic].color = 'low';
      else if (techniqueCount <= 4) matrix[tactic].color = 'medium';
      else matrix[tactic].color = 'high';
    });

    return matrix;
  }

  async getLateralMovementGraph(attackerId?: string) {
    const query: any = {};
    if (attackerId) query.attackerId = attackerId;

    const [movements, vmStatuses, attackers, credentials] = await Promise.all([
      LateralMovement.find(query).lean(),
      VMStatus.find().lean(),
      Attacker.find(attackerId ? { attackerId } : {}).lean(),
      Credential.find(attackerId ? { attackerId } : {}).lean()
    ]);

    const nodesMap = new Map<string, any>();

    for (const vm of vmStatuses) {
      nodesMap.set(vm.vmName, {
        id: vm.vmName,
        label: vm.vmName,
        type: 'vm',
        status: vm.status || 'unknown'
      });
    }

    for (const attacker of attackers) {
      const attackerNodeId = `attacker:${attacker.ipAddress}`;
      nodesMap.set(attackerNodeId, {
        id: attackerNodeId,
        label: attacker.ipAddress,
        type: 'attacker',
        status: attacker.status || 'Active'
      });

      if (attacker.entryPoint) {
        nodesMap.set(attacker.entryPoint, nodesMap.get(attacker.entryPoint) || {
          id: attacker.entryPoint,
          label: attacker.entryPoint,
          type: 'vm',
          status: 'unknown'
        });
      }
    }

    const edges: Array<{
      from: string;
      to: string;
      label: string;
      relation: 'entry' | 'lateral_movement' | 'credential_use';
      successful?: boolean;
    }> = [];

    for (const attacker of attackers) {
      if (!attacker.entryPoint) continue;
      edges.push({
        from: `attacker:${attacker.ipAddress}`,
        to: attacker.entryPoint,
        label: 'entry',
        relation: 'entry',
        successful: true
      });
    }

    for (const movement of movements) {
      edges.push({
        from: movement.sourceHost,
        to: movement.targetHost,
        label: movement.method,
        relation: 'lateral_movement',
        successful: movement.successful
      });
    }

    const attackerById = new Map(attackers.map((a: any) => [a.attackerId, a]));
    for (const credential of credentials) {
      const attacker = attackerById.get(credential.attackerId);
      if (!attacker?.ipAddress || !credential.decoyHost) continue;
      edges.push({
        from: `attacker:${attacker.ipAddress}`,
        to: credential.decoyHost,
        label: credential.username,
        relation: 'credential_use',
        successful: true
      });
    }

    return { nodes: Array.from(nodesMap.values()), edges };
  }

  async getSecurityPostureScore() {
    const [attackers, credentials, lateralMoves] = await Promise.all([
      Attacker.countDocuments({ status: 'Active' }),
      Credential.countDocuments(),
      LateralMovement.countDocuments({ successful: true })
    ]);

    const rawScore = attackers * 20 + credentials * 10 + lateralMoves * 15;
    const score = Math.max(0, Math.min(100, rawScore));

    let threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (score >= 90) threatLevel = 'CRITICAL';
    else if (score >= 70) threatLevel = 'HIGH';
    else if (score >= 40) threatLevel = 'MEDIUM';

    return {
      score,
      maxScore: 100,
      threatLevel,
      factors: {
        attackers,
        credentials,
        lateralMoves
      }
    };
  }

  async getCommandActivity(attackerId?: string, limit = 10) {
    const query: any = { type: 'Command Execution' };
    if (attackerId) query.attackerId = attackerId;

    const events = await AttackEvent.find(query).sort({ timestamp: -1 }).limit(limit).lean();

    return events.map(e => ({
      command: e.command || e.description,
      timestamp: e.timestamp,
      target: e.targetHost,
      technique: e.technique
    }));
  }

  async getDeceptionMetrics() {
    const timeframes = [1, 7, 30];
    const metrics: any = {};

    for (const days of timeframes) {
      const startDate = moment().subtract(days, 'days').toDate();
      
      const [decoyAccesses, uniqueAttackers, credentialsHarvested] = await Promise.all([
        AttackEvent.countDocuments({ timestamp: { $gte: startDate } }),
        Attacker.countDocuments({ firstSeen: { $gte: startDate } }),
        Credential.countDocuments({ timestamp: { $gte: startDate } })
      ]);

      metrics[`days${days}`] = {
        decoyAccesses,
        uniqueAttackers,
        credentialsHarvested,
        realDamagePrevented: decoyAccesses * 3
      };
    }

    return metrics;
  }
  async getActiveAttackers() {
    const { Attacker } = require('../models');
    const attackers = await Attacker.find({ status: 'Active' })
      .sort({ lastSeen: -1 })
      .limit(20)
      .lean();
    
    return attackers.map((a: any) => ({
      attackerId: a.attackerId,
      ipAddress: a.ipAddress,
      entryPoint: a.entryPoint,
      currentPrivilege: a.currentPrivilege,
      riskLevel: a.riskLevel,
      campaign: a.campaign,
      lastSeen: a.lastSeen,
      dwellTime: a.dwellTime
    }));
  }

  async getAttackerBehaviorAnalysis(attackerId?: string) {
    const query: any = {};
    if (attackerId) query.attackerId = attackerId;

    const events = await AttackEvent.find(query).lean();
    
    const behaviors = {
      privilegeEscalation: events.filter(e => e.type === 'Privilege Escalation').length > 0,
      credentialDumping: events.filter(e => 
        e.description.toLowerCase().includes('mimikatz') || 
        e.description.toLowerCase().includes('credential')
      ).length > 0,
      lateralMovement: events.filter(e => e.type === 'Lateral Movement').length > 0,
      dataExfiltration: events.filter(e => e.type === 'Data Exfiltration').length > 0,
      persistence: events.filter(e => e.type === 'Persistence').length > 0,
      defenseEvasion: events.filter(e => e.type === 'Defense Evasion').length > 0
    };

    const behaviorCount = Object.values(behaviors).filter(Boolean).length;
    const threatConfidence = behaviorCount >= 4 ? 'High' : behaviorCount >= 2 ? 'Medium' : 'Low';

    return { behaviors, threatConfidence };
  }

  async getIncidentSummary() {
    const events = await AttackEvent.find().lean();
    
    const summary = {
      dataExfiltrationAttempt: { count: 0, percentage: 0 },
      lateralMovement: { count: 0, percentage: 0 },
      credentialTheft: { count: 0, percentage: 0 },
      privilegeEscalation: { count: 0, percentage: 0 }
    };

    events.forEach(e => {
      if (e.type === 'Data Exfiltration') summary.dataExfiltrationAttempt.count++;
      if (e.type === 'Lateral Movement') summary.lateralMovement.count++;
      if (e.type === 'Credential Theft') summary.credentialTheft.count++;
      if (e.type === 'Privilege Escalation') summary.privilegeEscalation.count++;
    });

    const total = events.length || 1;
    Object.keys(summary).forEach(key => {
      summary[key as keyof typeof summary].percentage = 
        Math.round((summary[key as keyof typeof summary].count / total) * 100);
    });

    return summary;
  }

  private async calculateAverageDwellTime(): Promise<number> {
    const result = await Attacker.aggregate([
      { $match: { dwellTime: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$dwellTime' } } }
    ]);
    return result[0]?.avg || 0;
  }

  private async calculateTotalDwellTime(): Promise<number> {
    const result = await Attacker.aggregate([
      { $group: { _id: null, total: { $sum: '$dwellTime' } } }
    ]);
    return (result[0]?.total || 0) / 60;
  }

  private formatDwellTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  }

  private mapStageFromType(type: string, description: string): string {
    const lowerType = String(type || '').toLowerCase();
    const lowerDescription = String(description || '').toLowerCase();

    if (lowerType.includes('discovery') || lowerDescription.includes('nmap') || lowerDescription.includes('recon')) return 'RECON';
    if (lowerType.includes('initial access')) return 'INITIAL_ACCESS';
    if (lowerType.includes('credential')) return 'CREDENTIAL_ACCESS';
    if (lowerType.includes('lateral')) return 'LATERAL_MOVEMENT';
    if (lowerType.includes('privilege')) return 'PRIVILEGE_ESCALATION';
    if (lowerType.includes('command')) return 'EXECUTION';
    if (lowerType.includes('exfiltration')) return 'EXFILTRATION';
    return 'OTHER';
  }

  private formatStageLabel(stage: string): string {
    const labelMap: Record<string, string> = {
      RECON: 'Recon',
      INITIAL_ACCESS: 'Initial Access',
      CREDENTIAL_ACCESS: 'Credential Access',
      LATERAL_MOVEMENT: 'Lateral Movement',
      PRIVILEGE_ESCALATION: 'Privilege Escalation',
      EXECUTION: 'Execution',
      EXFILTRATION: 'Exfiltration',
      OTHER: 'Activity'
    };

    return labelMap[stage] || 'Activity';
  }
}
