export declare class DashboardService {
    private mitreService;
    constructor();
    getDashboardStats(): Promise<{
        activeAttackers: number;
        deceptionEngagement: {
            rate: number;
            level: string;
        };
        dwellTime: {
            hours: number;
            minutes: number;
            average: number;
        };
        realAssetsProtected: number;
        metrics: {
            totalEvents: number;
            stolenCredentials: number;
            compromisedHosts: number;
            blockedAttacks: number;
            falsePositives: number;
        };
    }>;
    getMappedActiveAttackers(): Promise<any[]>;
    getAttackerDashboard(attackerId: string): Promise<{
        id: string;
        attackerId: string;
        generatedAt: string;
        dashboard: any;
    } | null>;
    getAttackerProfile(attackerId: string): Promise<{
        attackerId: string;
        ipAddress: string;
        entryPoint: string;
        currentPrivilege: string;
        riskLevel: "Low" | "Medium" | "High" | "Critical";
        campaign: string;
        firstSeen: Date;
        lastSeen: Date;
        dwellTime: string;
        status: "Active" | "Inactive" | "Contained";
        geolocation: import("mongoose").FlattenMaps<{
            country: string;
            city: string;
            coordinates: [number, number];
        }> | undefined;
        fingerprint: import("mongoose").FlattenMaps<{
            userAgent: string;
            os: string;
            tools: string[];
        }> | undefined;
        credentials: {
            username: string;
            source: string;
            timestamp: Date;
            riskScore: number;
        }[];
        recentEvents: {
            type: "Initial Access" | "Credential Theft" | "Lateral Movement" | "Command Execution" | "Data Exfiltration" | "Privilege Escalation" | "Discovery" | "Persistence" | "Defense Evasion";
            timestamp: Date;
            description: string;
            technique: string;
            techniqueName: string;
            tactic: string;
            mitreConfidence: number;
        }[];
        lateralMovement: {
            from: string;
            to: string;
            method: "SSH" | "RDP" | "SMB" | "WinRM" | "WMI" | "PSExec" | "Other";
            successful: boolean;
        }[];
    } | null>;
    getAttackTimeline(attackerId?: string, hours?: number): Promise<{
        time: string;
        type: "Initial Access" | "Credential Theft" | "Lateral Movement" | "Command Execution" | "Data Exfiltration" | "Privilege Escalation" | "Discovery" | "Persistence" | "Defense Evasion";
        technique: string;
        techniqueName: string;
        tactic: string;
        description: string;
        severity: "Low" | "Medium" | "High" | "Critical";
        status: "Contained" | "Detected" | "In Progress" | "Blocked";
        mitreConfidence: number;
        classificationMethod: "exact" | "fuzzy" | "pattern" | "manual" | "unknown";
    }[]>;
    /**
     * Get MITRE ATT&CK matrix with proper technique classification
     * Uses cached MITRE data from MongoDB instead of hardcoded values
     */
    getMitreMatrix(attackerId?: string): Promise<any>;
    getLateralMovementGraph(attackerId?: string): Promise<{
        nodes: {
            id: string;
            label: string;
            type: "DMZ" | "Internal" | "Database" | "Jump" | "IoT";
            status: "Active" | "Inactive" | "Compromised" | "Under Attack";
            os: "IoT" | "Windows" | "Linux";
        }[];
        edges: {
            from: string;
            to: string;
            label: "SSH" | "RDP" | "SMB" | "WinRM" | "WMI" | "PSExec" | "Other";
            successful: boolean;
        }[];
    }>;
    getCommandActivity(attackerId?: string, limit?: number): Promise<{
        command: string;
        timestamp: Date;
        target: string;
        technique: string;
        techniqueName: string;
        tactic: string;
        mitreConfidence: number;
        classificationMethod: "exact" | "fuzzy" | "pattern" | "manual" | "unknown";
    }[]>;
    getDeceptionMetrics(): Promise<any>;
    getActiveAttackers(): Promise<{
        attackerId: any;
        ipAddress: any;
        entryPoint: any;
        currentPrivilege: any;
        riskLevel: any;
        campaign: any;
        lastSeen: any;
        dwellTime: any;
    }[]>;
    /**
     * Enhanced behavior analysis using proper MITRE ATT&CK classification
     * Replaces string-matching with technique-based detection
     */
    getAttackerBehaviorAnalysis(attackerId?: string): Promise<{
        behaviors: {
            privilegeEscalation: boolean;
            credentialAccess: boolean;
            credentialDumping: boolean;
            lateralMovement: boolean;
            defenseEvasion: boolean;
            persistence: boolean;
            discovery: boolean;
            execution: boolean;
            commandAndControl: boolean;
            initialAccess: boolean;
            collection: boolean;
            exfiltration: boolean;
            impact: boolean;
            reconnaissance: boolean;
            resourceDevelopment: boolean;
        };
        threatConfidence: string;
        sophistication: string;
        techniqueCount: number;
        tacticCoverage: number;
        avgClassificationConfidence: number;
        subtechniqueUsage: number;
        topTechniques: {
            name: string;
            count: number;
            tactic: string;
            id: string;
        }[];
        timeline: {
            time: string;
            tacticCount: number;
            tactics: string[];
        }[];
    }>;
    /**
     * Export attacker activity to MITRE ATT&CK Navigator layer format
     * Generates JSON that can be imported into https://mitre-attack.github.io/attack-navigator/
     */
    exportToNavigator(attackerId?: string): Promise<object>;
    /**
     * Get incident summary with MITRE technique breakdown
     */
    getIncidentSummary(): Promise<{
        dataExfiltrationAttempt: {
            count: number;
            percentage: number;
            techniques: string[];
        };
        lateralMovement: {
            count: number;
            percentage: number;
            techniques: string[];
        };
        credentialTheft: {
            count: number;
            percentage: number;
            techniques: string[];
        };
        privilegeEscalation: {
            count: number;
            percentage: number;
            techniques: string[];
        };
        defenseEvasion: {
            count: number;
            percentage: number;
            techniques: string[];
        };
        commandAndControl: {
            count: number;
            percentage: number;
            techniques: string[];
        };
    }>;
    /**
     * Get detailed technique information for an attacker
     */
    getAttackerTechniques(attackerId: string): Promise<{
        avgConfidence: number;
        commands: string[];
        id: string;
        name: string;
        tactic: string;
        count: number;
        firstSeen: Date;
        lastSeen: Date;
    }[]>;
    private getTopTechniques;
    private getBehaviorTimeline;
    private calculateAverageDwellTime;
    private calculateTotalDwellTime;
    private formatDwellTime;
}
