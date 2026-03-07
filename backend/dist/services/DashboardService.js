"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const models_1 = require("../models");
const moment_1 = __importDefault(require("moment"));
const AttackerMapper_1 = require("./AttackerMapper");
const MitreAttackService_1 = require("./MitreAttackService");
class DashboardService {
    constructor() {
        this.mitreService = new MitreAttackService_1.MitreAttackService();
    }
    async getDashboardStats() {
        const [activeAttackers, totalEvents, stolenCredentials, compromisedHosts, avgDwellTime, blockedAttacks, realAssetsCount, falsePositives] = await Promise.all([
            models_1.Attacker.countDocuments({ status: 'Active' }),
            models_1.AttackEvent.countDocuments(),
            models_1.Credential.countDocuments(),
            models_1.DecoyHost.countDocuments({ status: { $in: ['Compromised', 'Under Attack'] } }),
            this.calculateAverageDwellTime(),
            models_1.AttackEvent.countDocuments({ status: { $in: ['Blocked', 'Contained'] } }),
            // ✅ REAL ASSETS COUNT
            models_1.DecoyHost.countDocuments({
                segment: { $in: ['corp', 'production', 'internal'] }
            }),
            // ✅ FALSE POSITIVES (last 24 hours)
            models_1.AttackEvent.countDocuments({
                status: 'False Positive',
                timestamp: { $gte: (0, moment_1.default)().subtract(24, 'hours').toDate() }
            })
        ]);
        const totalHosts = await models_1.DecoyHost.countDocuments();
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
            realAssetsProtected: realAssetsCount,
            metrics: {
                totalEvents,
                stolenCredentials,
                compromisedHosts,
                blockedAttacks,
                falsePositives
            }
        };
    }
    async getMappedActiveAttackers() {
        const attackers = await models_1.Attacker.find({ status: 'Active' })
            .sort({ lastSeen: -1 })
            .limit(20)
            .lean();
        return attackers.map((a) => (0, AttackerMapper_1.mapToAttackerSummary)(a));
    }
    async getAttackerDashboard(attackerId) {
        const attacker = await models_1.Attacker.findOne({ attackerId }).lean();
        if (!attacker)
            return null;
        const dashboard = await (0, AttackerMapper_1.mapToDashboardData)(attacker);
        return {
            id: attacker.attackerId,
            attackerId: attacker.attackerId,
            generatedAt: new Date().toISOString(),
            dashboard,
        };
    }
    async getAttackerProfile(attackerId) {
        const attacker = await models_1.Attacker.findOne({ attackerId }).lean();
        if (!attacker)
            return null;
        const [credentials, recentEvents, movements] = await Promise.all([
            models_1.Credential.find({ attackerId }).sort({ timestamp: -1 }).limit(10).lean(),
            models_1.AttackEvent.find({ attackerId }).sort({ timestamp: -1 }).limit(5).lean(),
            models_1.LateralMovement.find({ attackerId }).sort({ timestamp: -1 }).lean()
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
                description: e.description,
                technique: e.technique,
                techniqueName: e.techniqueName,
                tactic: e.tactic,
                mitreConfidence: e.mitreConfidence
            })),
            lateralMovement: movements.map(m => ({
                from: m.sourceHost,
                to: m.targetHost,
                method: m.method,
                successful: m.successful
            }))
        };
    }
    async getAttackTimeline(attackerId, hours = 24) {
        const query = { timestamp: { $gte: (0, moment_1.default)().subtract(hours, 'hours').toDate() } };
        if (attackerId)
            query.attackerId = attackerId;
        const events = await models_1.AttackEvent.find(query).sort({ timestamp: 1 }).lean();
        return events.map(e => ({
            time: (0, moment_1.default)(e.timestamp).format('HH:mm'),
            type: e.type,
            technique: e.technique,
            techniqueName: e.techniqueName,
            tactic: e.tactic,
            description: e.description,
            severity: e.severity,
            status: e.status,
            mitreConfidence: e.mitreConfidence,
            classificationMethod: e.classificationMethod
        }));
    }
    /**
     * Get MITRE ATT&CK matrix with proper technique classification
     * Uses cached MITRE data from MongoDB instead of hardcoded values
     */
    async getMitreMatrix(attackerId) {
        // Get events from database with MITRE fields populated
        const query = {};
        if (attackerId)
            query.attackerId = attackerId;
        const events = await models_1.AttackEvent.find(query)
            .sort({ timestamp: -1 })
            .limit(1000)
            .lean();
        // Convert to format expected by MITRE service
        const attackEvents = events.map(e => ({
            command: e.command || e.description,
            timestamp: e.timestamp,
            severity: e.severity
        }));
        // Get properly structured matrix from MITRE service
        const matrix = await this.mitreService.buildAttackMatrix(attackEvents);
        // Format for frontend (matches your current structure but with all 14 tactics)
        const formatted = {};
        // Initialize all 14 official MITRE tactics (including Reconnaissance and Resource Development)
        const allTactics = [
            'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution',
            'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access',
            'Discovery', 'Lateral Movement', 'Collection', 'Command and Control',
            'Exfiltration', 'Impact'
        ];
        allTactics.forEach(tactic => {
            formatted[tactic] = {
                techniques: [],
                coverage: 0,
                color: 'none'
            };
        });
        // Populate with actual data from MITRE service
        matrix.forEach(({ tactic, tacticId, techniques }) => {
            const displayName = tactic.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            if (formatted[displayName]) {
                formatted[displayName].techniques = techniques.map(t => ({
                    id: t.id,
                    name: t.name,
                    count: t.count,
                    severity: t.confidence > 0.8 ? 'High' : t.confidence > 0.5 ? 'Medium' : 'Low',
                    firstSeen: t.firstSeen,
                    lastSeen: t.lastSeen,
                    confidence: t.confidence
                }));
                formatted[displayName].coverage = techniques.length;
                formatted[displayName].tacticId = tacticId;
                // Color coding based on technique diversity
                const count = techniques.length;
                if (count === 0)
                    formatted[displayName].color = 'none';
                else if (count <= 2)
                    formatted[displayName].color = 'low';
                else if (count <= 4)
                    formatted[displayName].color = 'medium';
                else
                    formatted[displayName].color = 'high';
            }
        });
        return formatted;
    }
    async getLateralMovementGraph(attackerId) {
        const query = {};
        if (attackerId)
            query.attackerId = attackerId;
        const [movements, hosts] = await Promise.all([
            models_1.LateralMovement.find(query).lean(),
            models_1.DecoyHost.find().lean()
        ]);
        const nodes = hosts.map(h => ({
            id: h.hostname,
            label: h.hostname,
            type: h.segment,
            status: h.status,
            os: h.os
        }));
        const edges = movements.map(m => ({
            from: m.sourceHost,
            to: m.targetHost,
            label: m.method,
            successful: m.successful
        }));
        return { nodes, edges };
    }
    async getCommandActivity(attackerId, limit = 10) {
        const query = { type: 'Command Execution' };
        if (attackerId)
            query.attackerId = attackerId;
        const events = await models_1.AttackEvent.find(query)
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        return events.map(e => ({
            command: e.command || e.description,
            timestamp: e.timestamp,
            target: e.targetHost,
            technique: e.technique,
            techniqueName: e.techniqueName,
            tactic: e.tactic,
            mitreConfidence: e.mitreConfidence,
            classificationMethod: e.classificationMethod
        }));
    }
    async getDeceptionMetrics() {
        const timeframes = [1, 7, 30];
        const metrics = {};
        for (const days of timeframes) {
            const startDate = (0, moment_1.default)().subtract(days, 'days').toDate();
            const [decoyAccesses, uniqueAttackers, credentialsHarvested] = await Promise.all([
                models_1.AttackEvent.countDocuments({ timestamp: { $gte: startDate } }),
                models_1.Attacker.countDocuments({ firstSeen: { $gte: startDate } }),
                models_1.Credential.countDocuments({ timestamp: { $gte: startDate } })
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
        const attackers = await models_1.Attacker.find({ status: 'Active' })
            .sort({ lastSeen: -1 })
            .limit(20)
            .lean();
        return attackers.map((a) => ({
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
    /**
     * Enhanced behavior analysis using proper MITRE ATT&CK classification
     * Replaces string-matching with technique-based detection
     */
    async getAttackerBehaviorAnalysis(attackerId) {
        const query = {};
        if (attackerId)
            query.attackerId = attackerId;
        const events = await models_1.AttackEvent.find(query).lean();
        // Use MITRE service to classify events properly
        const classifiedEvents = [];
        for (const event of events) {
            const classified = await this.mitreService.classifyEvent(event.command || event.description);
            if (classified) {
                classifiedEvents.push(classified);
            }
        }
        // Aggregate behaviors based on actual MITRE tactics
        const behaviors = {
            privilegeEscalation: classifiedEvents.some(e => e.tactic === 'privilege-escalation'),
            credentialAccess: classifiedEvents.some(e => e.tactic === 'credential-access'),
            credentialDumping: classifiedEvents.some(e => e.techniqueId.startsWith('T1003') // All credential dumping variants
            ),
            lateralMovement: classifiedEvents.some(e => e.tactic === 'lateral-movement'),
            defenseEvasion: classifiedEvents.some(e => e.tactic === 'defense-evasion'),
            persistence: classifiedEvents.some(e => e.tactic === 'persistence'),
            discovery: classifiedEvents.some(e => e.tactic === 'discovery'),
            execution: classifiedEvents.some(e => e.tactic === 'execution'),
            commandAndControl: classifiedEvents.some(e => e.tactic === 'command-and-control'),
            initialAccess: classifiedEvents.some(e => e.tactic === 'initial-access'),
            collection: classifiedEvents.some(e => e.tactic === 'collection'),
            exfiltration: classifiedEvents.some(e => e.tactic === 'exfiltration'),
            impact: classifiedEvents.some(e => e.tactic === 'impact'),
            reconnaissance: classifiedEvents.some(e => e.tactic === 'reconnaissance'),
            resourceDevelopment: classifiedEvents.some(e => e.tactic === 'resource-development'),
        };
        const tacticCount = Object.values(behaviors).filter(Boolean).length;
        const avgConfidence = classifiedEvents.length > 0
            ? classifiedEvents.reduce((sum, e) => sum + e.confidence, 0) / classifiedEvents.length
            : 0;
        // Calculate sophistication based on technique diversity and confidence
        const uniqueTechniques = new Set(classifiedEvents.map(e => e.techniqueId)).size;
        const subtechniqueUsage = classifiedEvents.filter(e => e.isSubtechnique).length;
        let sophistication = 'Low';
        if (uniqueTechniques > 10 && avgConfidence > 0.7 && subtechniqueUsage > 3) {
            sophistication = 'Advanced';
        }
        else if (uniqueTechniques > 5 && avgConfidence > 0.5) {
            sophistication = 'Intermediate';
        }
        return {
            behaviors,
            threatConfidence: tacticCount >= 6 ? 'Critical' : tacticCount >= 4 ? 'High' : tacticCount >= 2 ? 'Medium' : 'Low',
            sophistication,
            techniqueCount: uniqueTechniques,
            tacticCoverage: new Set(classifiedEvents.map(e => e.tactic)).size,
            avgClassificationConfidence: Math.round(avgConfidence * 100) / 100,
            subtechniqueUsage,
            topTechniques: this.getTopTechniques(classifiedEvents, 5),
            timeline: this.getBehaviorTimeline(classifiedEvents)
        };
    }
    /**
     * Export attacker activity to MITRE ATT&CK Navigator layer format
     * Generates JSON that can be imported into https://mitre-attack.github.io/attack-navigator/
     */
    async exportToNavigator(attackerId) {
        const query = {};
        if (attackerId)
            query.attackerId = attackerId;
        const events = await models_1.AttackEvent.find(query).lean();
        const attackEvents = events
            .filter(e => e.timestamp)
            .map(e => {
            const date = new Date(e.timestamp);
            const safeDate = !isNaN(date.getTime())
                ? date
                : new Date(); // fallback Date object
            return {
                command: e.command || e.description || 'Unknown Command',
                timestamp: safeDate, // ✅ Date, not string
                severity: (e.severity || 'Low')
            };
        });
        return this.mitreService.generateNavigatorLayer(attackEvents, {
            name: attackerId
                ? `Attacker ${attackerId} Activity`
                : 'Global Honeypot Activity',
            description: `Generated on ${new Date().toISOString()} from ${attackEvents.length} events`
        });
    }
    /**
     * Get incident summary with MITRE technique breakdown
     */
    async getIncidentSummary() {
        const events = await models_1.AttackEvent.find().lean();
        // Use MITRE classification instead of simple type matching
        const classifiedEvents = [];
        for (const event of events) {
            const classified = await this.mitreService.classifyEvent(event.command || event.description);
            if (classified)
                classifiedEvents.push(classified);
        }
        const summary = {
            dataExfiltrationAttempt: {
                count: 0,
                percentage: 0,
                techniques: []
            },
            lateralMovement: {
                count: 0,
                percentage: 0,
                techniques: []
            },
            credentialTheft: {
                count: 0,
                percentage: 0,
                techniques: []
            },
            privilegeEscalation: {
                count: 0,
                percentage: 0,
                techniques: []
            },
            defenseEvasion: {
                count: 0,
                percentage: 0,
                techniques: []
            },
            commandAndControl: {
                count: 0,
                percentage: 0,
                techniques: []
            }
        };
        // Categorize by MITRE tactic
        for (const e of classifiedEvents) {
            switch (e.tactic) {
                case 'exfiltration':
                    summary.dataExfiltrationAttempt.count++;
                    if (!summary.dataExfiltrationAttempt.techniques.includes(e.techniqueId)) {
                        summary.dataExfiltrationAttempt.techniques.push(e.techniqueId);
                    }
                    break;
                case 'lateral-movement':
                    summary.lateralMovement.count++;
                    if (!summary.lateralMovement.techniques.includes(e.techniqueId)) {
                        summary.lateralMovement.techniques.push(e.techniqueId);
                    }
                    break;
                case 'credential-access':
                    summary.credentialTheft.count++;
                    if (!summary.credentialTheft.techniques.includes(e.techniqueId)) {
                        summary.credentialTheft.techniques.push(e.techniqueId);
                    }
                    break;
                case 'privilege-escalation':
                    summary.privilegeEscalation.count++;
                    if (!summary.privilegeEscalation.techniques.includes(e.techniqueId)) {
                        summary.privilegeEscalation.techniques.push(e.techniqueId);
                    }
                    break;
                case 'defense-evasion':
                    summary.defenseEvasion.count++;
                    if (!summary.defenseEvasion.techniques.includes(e.techniqueId)) {
                        summary.defenseEvasion.techniques.push(e.techniqueId);
                    }
                    break;
                case 'command-and-control':
                    summary.commandAndControl.count++;
                    if (!summary.commandAndControl.techniques.includes(e.techniqueId)) {
                        summary.commandAndControl.techniques.push(e.techniqueId);
                    }
                    break;
            }
        }
        const total = classifiedEvents.length || 1;
        Object.keys(summary).forEach(key => {
            const k = key;
            summary[k].percentage = Math.round((summary[k].count / total) * 100);
        });
        return summary;
    }
    /**
     * Get detailed technique information for an attacker
     */
    async getAttackerTechniques(attackerId) {
        const events = await models_1.AttackEvent.find({ attackerId }).lean();
        const techniqueMap = new Map();
        for (const event of events) {
            if (!event.technique)
                continue;
            if (!techniqueMap.has(event.technique)) {
                techniqueMap.set(event.technique, {
                    id: event.technique,
                    name: event.techniqueName || 'Unknown',
                    tactic: event.tactic || 'Unknown',
                    count: 0,
                    firstSeen: event.timestamp,
                    lastSeen: event.timestamp,
                    avgConfidence: 0,
                    commands: new Set()
                });
            }
            const tech = techniqueMap.get(event.technique);
            tech.count++;
            tech.commands.add(event.command || event.description);
            if (event.timestamp < tech.firstSeen)
                tech.firstSeen = event.timestamp;
            if (event.timestamp > tech.lastSeen)
                tech.lastSeen = event.timestamp;
            tech.avgConfidence += event.mitreConfidence || 0;
        }
        // Calculate averages and format
        return Array.from(techniqueMap.values()).map(t => ({
            ...t,
            avgConfidence: Math.round((t.avgConfidence / t.count) * 100) / 100,
            commands: Array.from(t.commands).slice(0, 5) // Limit to 5 examples
        })).sort((a, b) => b.count - a.count);
    }
    // Private helper methods
    getTopTechniques(events, limit = 5) {
        const counts = new Map();
        events.forEach(e => {
            const current = counts.get(e.techniqueId) || {
                name: e.techniqueName,
                count: 0,
                tactic: e.tactic
            };
            current.count++;
            counts.set(e.techniqueId, current);
        });
        return Array.from(counts.entries())
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
    getBehaviorTimeline(events) {
        // Group by tactic occurrence (simplified since ClassifiedEvent doesn't have timestamps)
        const timeline = new Map();
        const now = new Date();
        const currentHour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
        events.forEach(e => {
            if (!e.tactic)
                return;
            if (!timeline.has(currentHour)) {
                timeline.set(currentHour, new Set());
            }
            timeline.get(currentHour).add(e.tactic);
        });
        return Array.from(timeline.entries())
            .map(([time, tactics]) => ({
            time,
            tacticCount: tactics.size,
            tactics: Array.from(tactics)
        }))
            .sort((a, b) => a.time.localeCompare(b.time));
    }
    async calculateAverageDwellTime() {
        const result = await models_1.Attacker.aggregate([
            { $match: { dwellTime: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$dwellTime' } } }
        ]);
        return result[0]?.avg || 0;
    }
    async calculateTotalDwellTime() {
        const result = await models_1.Attacker.aggregate([
            { $group: { _id: null, total: { $sum: '$dwellTime' } } }
        ]);
        return (result[0]?.total || 0) / 60;
    }
    formatDwellTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}m`;
    }
}
exports.DashboardService = DashboardService;
//# sourceMappingURL=DashboardService.js.map