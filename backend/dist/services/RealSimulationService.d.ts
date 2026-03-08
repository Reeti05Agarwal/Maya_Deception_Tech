import { EventEmitter } from 'events';
export declare class RealSimulationService extends EventEmitter {
    private vagrantDir;
    private vmCache;
    private mitreService;
    constructor();
    /**
     * Helper method to handle simulation errors consistently
     * Returns a standardized error result with proper logging
     */
    private handleSimulationError;
    /**
     * Discover running VMs - always use vagrant-based discovery for accuracy
     * Database is used as a secondary source, but we verify actual VM status
     */
    private discoverVMs;
    /**
     * Discover running VMs via vagrant commands and virsh (using correct domain naming)
     * Based on simulations/fake/check_vms.sh script
     */
    private discoverVMsFromVagrant;
    /**
     * Execute command on VM via SSH
     */
    private executeOnVM;
    /**
     * Simulate REAL SSH brute force attack with MITRE classification
     */
    simulateSSHBruteForce(params: {
        target: string;
        attempts?: number;
    }): Promise<{
        success: boolean;
        attackerId: string;
        eventsGenerated: number;
        real: boolean;
    }>;
    /**
     * Mock fallback if VM not available
     */
    private simulateSSHBruteForceMock;
    /**
     * Simulate REAL lateral movement with MITRE classification
     */
    simulateLateralMovement(params: {
        source: string;
        targets: string[];
    }): Promise<any>;
    /**
     * Simulate REAL credential dumping with MITRE classification
     */
    simulateCredentialTheft(params: {
        target: string;
        tool?: string;
    }): Promise<any>;
    /**
     * Simulate REAL network discovery with MITRE classification
     */
    simulateDiscovery(params: {
        source: string;
        scanType?: string;
    }): Promise<{
        success: boolean;
        attackerId: string;
        commandsExecuted: number;
        real: boolean;
    }>;
    /**
     * Mock discovery simulation
     */
    private simulateDiscoveryMock;
    /**
     * Simulate REAL privilege escalation with MITRE classification
     */
    simulatePrivilegeEscalation(params: {
        target: string;
        method?: string;
    }): Promise<{
        success: boolean;
        attackerId: string;
        real: boolean;
    } | {
        success: boolean;
        attackerId: string;
        eventsGenerated: number;
        real: boolean;
    }>;
    /**
     * Mock privilege escalation simulation
     */
    private simulatePrivilegeEscalationMock;
    /**
     * Simulate REAL full attack campaign with MITRE classification
     */
    simulateFullCampaign(params: {
        complexity?: string;
    }): Promise<{
        success: boolean;
        attackerId: string;
        campaign: string;
        stagesCompleted: number;
        real: boolean;
    }>;
    /**
     * Mock full campaign simulation
     */
    private simulateFullCampaignMock;
    /**
     * Refresh VM cache - force rediscovery of running VMs
     */
    refreshVMs(): Promise<{
        count: number;
        vms: string[];
    }>;
    /**
     * Manual VM cache population for debugging/testing
     * Use this if automatic discovery is not working
     */
    populateVMCacheManually(vmConfigs: Array<{
        name: string;
        path: string;
        ip: string;
    }>): Promise<{
        count: number;
        vms: string[];
    }>;
    /**
     * Get current VM cache status
     */
    getVMCacheStatus(): {
        count: number;
        vms: {
            name: string;
            ip: string;
            path: string;
        }[];
    };
}
