import { EventEmitter } from 'events';
export declare class RealSimulationService extends EventEmitter {
    private vagrantDir;
    private vmCache;
    constructor();
    /**
     * Discover running VMs and cache their info
     */
    private discoverVMs;
    /**
     * Execute command on VM via SSH
     */
    private executeOnVM;
    /**
     * Simulate REAL SSH brute force attack
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
     * Simulate REAL lateral movement
     */
    simulateLateralMovement(params: {
        source: string;
        targets: string[];
    }): Promise<{
        success: boolean;
        reason: string;
        attackerId?: undefined;
        path?: undefined;
        real?: undefined;
    } | {
        success: boolean;
        attackerId: string;
        path: string[];
        real: boolean;
        reason?: undefined;
    }>;
    /**
     * Simulate REAL credential dumping
     */
    simulateCredentialTheft(params: {
        target: string;
        tool?: string;
    }): Promise<{
        success: boolean;
        reason: string;
        attackerId?: undefined;
        credentialsStolen?: undefined;
        real?: undefined;
    } | {
        success: boolean;
        attackerId: string;
        credentialsStolen: number;
        real: boolean;
        reason?: undefined;
    }>;
    /**
     * Refresh VM cache
     */
    refreshVMs(): Promise<{
        count: number;
        vms: string[];
    }>;
}
