import { EventEmitter } from 'events';
export declare class CRDTSyncService extends EventEmitter {
    private syncInterval?;
    private vmUpdateInterval?;
    private vagrantDir;
    private isSyncing;
    constructor();
    startSyncLoop(intervalMs?: number): void;
    stopSyncLoop(): void;
    private getVMStatus;
    private updateVMStatusInDB;
    performSync(): Promise<void>;
    private processState;
    /**
     * Extract attacker IP from CRDT state
     * Since tags contain (node_id, timestamp), we need to track attacker IP separately
     * This implementation uses the attackerIp parameter passed from processState
     */
    private extractAttackerIpFromTags;
    private updateAttacker;
    /**
     * Create a visit event when attacker visits a decoy
     */
    private addVisitEvent;
    /**
     * Create an action event from attacker activity on a decoy
     */
    private addActionEvent;
    /**
     * Add a stolen credential to the database
     */
    private addCredential;
    /**
     * Create a session event for active attacker sessions
     */
    private addSessionEvent;
    /**
     * Detect campaign name from CRDT state
     */
    private detectCampaign;
    /**
     * Infer privilege level from location/activity data
     */
    private inferPrivilege;
}
