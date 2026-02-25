import { EventEmitter } from 'events';
export declare class SimulationService extends EventEmitter {
    private activeSimulations;
    /**
     * Simulate SSH brute force attack followed by successful credential use
     */
    simulateSSHBruteForce(params: {
        target: string;
        attempts?: number;
    }): Promise<{
        success: boolean;
        attackerId: string;
        eventsGenerated: number;
    }>;
    /**
     * Simulate lateral movement between hosts
     */
    simulateLateralMovement(params: {
        source: string;
        targets: string[];
    }): Promise<{
        success: boolean;
        attackerId: string;
        path: string[];
    }>;
    /**
     * Simulate credential dumping (Mimikatz-style)
     */
    simulateCredentialTheft(params: {
        target: string;
        tool?: string;
    }): Promise<{
        success: boolean;
        attackerId: string;
        credentialsStolen: number;
    }>;
    /**
     * Simulate network discovery and reconnaissance
     */
    simulateDiscovery(params: {
        source: string;
        scanType?: string;
    }): Promise<{
        success: boolean;
        attackerId: string;
        commandsExecuted: number;
    }>;
    /**
     * Simulate privilege escalation
     */
    simulatePrivilegeEscalation(params: {
        target: string;
        method?: string;
    }): Promise<{
        success: boolean;
        attackerId: string;
    }>;
    /**
     * Simulate full attack campaign (multi-stage)
     */
    simulateFullCampaign(params: {
        complexity?: string;
    }): Promise<{
        success: boolean;
        attackerId: string;
        campaign: string;
        stagesCompleted: number;
    }>;
    /**
     * Helper method to create attack events and emit real-time updates
     */
    private createEvent;
    /**
     * Trigger immediate CRDT sync
     */
    triggerSync(): Promise<{
        success: boolean;
        message: string;
    }>;
}
