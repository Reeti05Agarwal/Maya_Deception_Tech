"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CRDTSyncService = void 0;
// backend/src/services/CRDTSyncService.ts
const events_1 = require("events");
const models_1 = require("../models");
const logger_1 = require("../utils/logger");
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const models_2 = require("../models");
const MitreAttackService_1 = require("./MitreAttackService");
class CRDTSyncService extends events_1.EventEmitter {
    constructor() {
        super();
        this.isSyncing = false;
        // Use absolute path from services directory
        this.vagrantDir = process.env.VAGRANT_DIR || path.join(__dirname, '../../simulations/fake');
    }
    startSyncLoop(intervalMs = 10000) {
        // CRDT sync for attacker data
        this.syncInterval = setInterval(() => {
            if (!this.isSyncing) {
                this.performSync().catch(err => logger_1.logger.error('CRDT sync error:', err));
            }
        }, intervalMs);
        // VM status updates every 30 seconds
        this.vmUpdateInterval = setInterval(() => {
            this.updateVMStatusInDB().catch(err => logger_1.logger.error('VM status update error:', err));
        }, 30000);
        // Initial updates
        this.updateVMStatusInDB().catch(err => logger_1.logger.error('Initial VM status error:', err));
        logger_1.logger.info(`Started CRDT sync loop with ${intervalMs}ms interval`);
    }
    stopSyncLoop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = undefined;
        }
        if (this.vmUpdateInterval) {
            clearInterval(this.vmUpdateInterval);
            this.vmUpdateInterval = undefined;
        }
    }
    // NEW: Reliable VM status detection using virsh + vagrant fallback
    async getVMStatus(vmName, vmPath) {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        // Try virsh first (fastest, most accurate)
        try {
            const { stdout } = await execAsync(`virsh domstate ${vmName} 2>&1`, { timeout: 5000 });
            const state = stdout.trim().toLowerCase();
            logger_1.logger.debug(`virsh domstate ${vmName}: ${state}`);
            if (state === 'running') {
                // Get IP if running
                let ip = undefined;
                try {
                    const { stdout: ipOutput } = await execAsync(`virsh domifaddr ${vmName} | grep ipv4 | awk '{print $4}' | cut -d/ -f1`, { timeout: 5000 });
                    ip = ipOutput.trim() || undefined;
                }
                catch (e) {
                    // IP not critical
                }
                return { status: 'running', exists: true, ip };
            }
            if (state === 'shut off' || state === 'shutdown') {
                return { status: 'stopped', exists: true };
            }
            if (state === 'paused') {
                return { status: 'stopped', exists: true };
            }
            if (state.includes('error') || state.includes('failed')) {
                return { status: 'error', exists: true };
            }
            // Domain not found or other state
            if (state.includes('not found') || state.includes('no domain')) {
                // Fall through to vagrant check
            }
            else {
                return { status: 'unknown', exists: true };
            }
        }
        catch (virshError) {
            // virsh failed, try vagrant
            logger_1.logger.debug(`virsh failed for ${vmName}, trying vagrant`);
        }
        // Fallback: vagrant status in VM directory
        try {
            const { stdout } = await execAsync(`cd ${vmPath} && vagrant status --machine-readable`, { timeout: 10000 });
            logger_1.logger.debug(`Vagrant status for ${vmName}: ${stdout.substring(0, 200)}`);
            // Check for "not created" state
            if (stdout.includes('state,not_created')) {
                return { status: 'not_created', exists: false };
            }
            // Parse machine-readable format: timestamp,provider,state,state-short,state-long
            const stateLines = stdout.split('\n').filter((l) => l.includes(',state,') && !l.includes('state-human'));
            if (stateLines.length > 0) {
                const parts = stateLines[0].split(',');
                if (parts.length >= 4) {
                    const vagrantState = parts[3].trim();
                    const isRunning = vagrantState === 'running';
                    return {
                        status: isRunning ? 'running' : vagrantState,
                        exists: true
                    };
                }
            }
            return { status: 'unknown', exists: true };
        }
        catch (vagrantError) {
            logger_1.logger.warn(`Vagrant status failed for ${vmName}:`, vagrantError.message);
            return { status: 'error', exists: false };
        }
    }
    async updateVMStatusInDB() {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        const vagrantDir = process.env.VAGRANT_DIR || path.join(__dirname, '../../simulations/fake');
        if (!fs.existsSync(vagrantDir)) {
            logger_1.logger.warn('Vagrant directory not found:', vagrantDir);
            return;
        }
        const entries = fs.readdirSync(vagrantDir, { withFileTypes: true });
        const vmDirs = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .filter((name) => name.startsWith('fake-') || name === 'gateway-vm');
        logger_1.logger.info(`Checking ${vmDirs.length} VMs in ${vagrantDir}`);
        for (const vmName of vmDirs) {
            const vmPath = path.join(vagrantDir, vmName);
            // Skip if no Vagrantfile
            if (!fs.existsSync(path.join(vmPath, 'Vagrantfile'))) {
                logger_1.logger.debug(`Skipping ${vmName}: no Vagrantfile`);
                continue;
            }
            try {
                // Use reliable status detection
                const { status, exists, ip: virshIp } = await this.getVMStatus(vmName, vmPath);
                logger_1.logger.info(`VM ${vmName} status: ${status} (exists: ${exists})`);
                const updateData = {
                    vmName,
                    hostname: vmName,
                    status: status === 'not_created' ? 'stopped' : status, // Map not_created to stopped for frontend
                    lastSeen: new Date(),
                };
                // Only collect detailed data if VM is running
                if (status === 'running') {
                    try {
                        // Use virsh IP if available, otherwise try vagrant ssh
                        let vmIp = virshIp;
                        if (!vmIp) {
                            try {
                                const { stdout: ipOutput } = await execAsync(`cd ${vmPath} && vagrant ssh -c "hostname -I | awk '{print \\$1}'" 2>/dev/null`, { timeout: 8000 });
                                vmIp = ipOutput.trim() || undefined;
                            }
                            catch (e) {
                                // Ignore IP fetch errors
                            }
                        }
                        updateData.ip = vmIp;
                        // Get CRDT stats - UPDATED with improved parsing
                        try {
                            // Check if syslogd-helper exists and run it, otherwise return empty JSON
                            const { stdout: statsOutput } = await execAsync(`cd ${vmPath} && vagrant ssh -c "if command -v syslogd-helper >/dev/null 2>&1; then sudo syslogd-helper stats 2>/dev/null; else echo '{}'; fi" 2>/dev/null`, { timeout: 8000 });
                            // Try to parse as JSON first (syslogd-helper should output JSON)
                            try {
                                if (statsOutput && statsOutput.trim() && statsOutput.trim() !== '{}' && statsOutput.trim() !== 'NO_STATS') {
                                    const stats = JSON.parse(statsOutput);
                                    const attackers = Object.keys(stats.attackers || {}).length;
                                    const credentials = Object.keys(stats.stolen_creds?.adds || {}).length;
                                    const sessions = Object.keys(stats.active_sessions?.entries || {}).length;
                                    const hash = stats.state_hash || '';
                                    updateData.crdtState = { attackers, credentials, sessions, hash };
                                    if (attackers > 0 || credentials > 0 || sessions > 0) {
                                        logger_1.logger.info(`VM ${vmName} CRDT: ${attackers} attackers, ${credentials} creds, ${sessions} sessions`);
                                    }
                                }
                                else {
                                    updateData.crdtState = { attackers: 0, credentials: 0, sessions: 0, hash: '' };
                                }
                            }
                            catch (parseError) {
                                // If not JSON, try to parse the old text format
                                if (statsOutput && statsOutput.includes('Attackers:')) {
                                    const lines = statsOutput.split('\n');
                                    const attackers = parseInt(lines.find((l) => l.includes('Attackers:'))?.split(':')[1]?.trim() || '0');
                                    const credentials = parseInt(lines.find((l) => l.includes('Credentials:'))?.split(':')[1]?.trim() || '0');
                                    const sessions = parseInt(lines.find((l) => l.includes('Sessions:'))?.split(':')[1]?.trim() || '0');
                                    const hash = lines.find((l) => l.includes('State hash:'))?.split(':')[1]?.trim() || '';
                                    updateData.crdtState = { attackers, credentials, sessions, hash };
                                    logger_1.logger.info(`VM ${vmName} CRDT (legacy): ${attackers} attackers, ${credentials} creds`);
                                }
                                else {
                                    updateData.crdtState = { attackers: 0, credentials: 0, sessions: 0, hash: '' };
                                }
                            }
                        }
                        catch (statsError) {
                            logger_1.logger.warn(`Failed to get CRDT stats for ${vmName}:`, statsError);
                            updateData.crdtState = { attackers: 0, credentials: 0, sessions: 0, hash: '' };
                        }
                        // Get Docker containers
                        try {
                            const { stdout: dockerOutput } = await execAsync(`cd ${vmPath} && vagrant ssh -c "sudo docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}' 2>/dev/null || echo ''" 2>/dev/null`, { timeout: 8000 });
                            if (dockerOutput.trim()) {
                                updateData.dockerContainers = dockerOutput.split('\n')
                                    .filter((line) => line.includes('|'))
                                    .map((line) => {
                                    const parts = line.split('|');
                                    return {
                                        id: parts[0]?.substring(0, 12) || '',
                                        name: parts[1] || '',
                                        image: parts[2] || '',
                                        status: parts[3]?.includes('Up') ? 'running' : 'exited',
                                        ports: parts[4] ? parts[4].split(', ') : [],
                                        created: ''
                                    };
                                });
                            }
                            else {
                                updateData.dockerContainers = [];
                            }
                        }
                        catch (dockerError) {
                            updateData.dockerContainers = [];
                        }
                    }
                    catch (detailError) {
                        logger_1.logger.warn(`Failed to get details for ${vmName}:`, detailError);
                    }
                }
                else {
                    // VM not running - clear dynamic data
                    updateData.crdtState = { attackers: 0, credentials: 0, sessions: 0, hash: '' };
                    updateData.dockerContainers = [];
                    if (!updateData.ip)
                        updateData.ip = undefined;
                }
                // Upsert to MongoDB
                await models_2.VMStatus.findOneAndUpdate({ vmName }, updateData, { upsert: true, new: true });
                logger_1.logger.info(`Updated VM status for ${vmName}: ${updateData.status}`);
            }
            catch (error) {
                logger_1.logger.error(`Failed to update VM status for ${vmName}:`, error.message);
                // Mark as error in DB
                await models_2.VMStatus.findOneAndUpdate({ vmName }, {
                    vmName,
                    hostname: vmName,
                    status: 'error',
                    lastSeen: new Date(),
                    crdtState: { attackers: 0, credentials: 0, sessions: 0, hash: '' },
                    dockerContainers: []
                }, { upsert: true });
            }
        }
    }
    async performSync() {
        this.isSyncing = true;
        let attackersFound = 0;
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            // Use same VM list as check_vms.sh
            const vmNames = [
                'gateway-vm',
                'fake-ftp-01', 'fake-jump-01', 'fake-rdp-01', 'fake-smb-01',
                'fake-ssh-01', 'fake-web-01', 'fake-web-02', 'fake-web-03'
            ];
            for (const vm of vmNames) {
                try {
                    const vmPath = path.join(this.vagrantDir, vm);
                    // Skip if directory doesn't exist
                    if (!fs.existsSync(vmPath)) {
                        continue;
                    }
                    // Check if VM is running using virsh with correct domain name (vm_default)
                    let isRunning = false;
                    try {
                        const domainName = `${vm}_default`;
                        const { stdout } = await execAsync(`virsh domstate ${domainName} 2>/dev/null || echo ""`, { timeout: 3000 });
                        isRunning = stdout.trim().toLowerCase() === 'running';
                        if (isRunning) {
                            logger_1.logger.debug(`CRDT sync: ${vm} (${domainName}) is running`);
                        }
                    }
                    catch (e) {
                        // virsh failed, skip this VM for CRDT sync
                        logger_1.logger.debug(`virsh check failed for ${vm}, skipping for CRDT sync`);
                        continue;
                    }
                    if (!isRunning) {
                        logger_1.logger.debug(`VM ${vm} not running, skipping CRDT sync`);
                        continue;
                    }
                    // Get CRDT state from running VM
                    const { stdout } = await execAsync(`cd ${vmPath} && vagrant ssh -c "sudo cat /var/lib/.syscache 2>/dev/null || echo '{}'"`, { timeout: 10000 });
                    if (stdout && stdout.trim() !== '{}' && stdout.trim() !== '') {
                        const state = JSON.parse(stdout);
                        const beforeCount = Object.keys(state.attackers || {}).length;
                        if (beforeCount > 0) {
                            attackersFound += beforeCount;
                            await this.processState(state, vm);
                            logger_1.logger.info(`Processed state from ${vm}: ${beforeCount} attackers`);
                        }
                    }
                }
                catch (error) {
                    logger_1.logger.warn(`Failed to sync with ${vm}:`, error.message);
                }
            }
            logger_1.logger.info(`CRDT sync complete: ${attackersFound} attackers found`);
            this.emit('syncComplete', { attackersCount: attackersFound, timestamp: new Date().toISOString() });
        }
        catch (error) {
            logger_1.logger.error('CRDT sync failed:', error);
            this.emit('syncError', error);
        }
        finally {
            this.isSyncing = false;
        }
    }
    async processState(state, sourceHost) {
        const nodeId = state.node_id || sourceHost;
        logger_1.logger.info(`Processing CRDT state from ${sourceHost}, node_id: ${nodeId}`);
        const attackerCount = Object.keys(state.attackers || {}).length;
        const credCount = state.stolen_creds?.adds ? Object.keys(state.stolen_creds.adds).length : 0;
        logger_1.logger.info(`State contents: attackers=${attackerCount}, creds=${credCount}`);
        if (state.attackers) {
            for (const [attackerIp, attackerState] of Object.entries(state.attackers)) {
                if (attackerIp === 'unknown') {
                    logger_1.logger.warn(`Skipping attacker with IP 'unknown' from ${sourceHost}`);
                    continue;
                }
                logger_1.logger.info(`Processing attacker: ${attackerIp} from ${sourceHost}`);
                await this.updateAttacker(attackerIp, attackerState, sourceHost);
            }
        }
        if (state.stolen_creds?.adds) {
            for (const [cred, tags] of Object.entries(state.stolen_creds.adds)) {
                for (const [node, timestamp] of tags) {
                    await this.addCredential(cred, nodeId, this.extractAttackerIpFromTags(tags));
                }
            }
        }
        if (state.active_sessions?.entries) {
            for (const [host, [sessionId, ts, node]] of Object.entries(state.active_sessions.entries)) {
                await this.addSessionEvent(sessionId, host, node, ts);
            }
        }
    }
    /**
     * Extract attacker IP from CRDT state
     * Since tags contain (node_id, timestamp), we need to track attacker IP separately
     * This implementation uses the attackerIp parameter passed from processState
     */
    extractAttackerIpFromTags(tags, attackerIp) {
        // If attackerIp is provided directly, use it
        if (attackerIp && attackerIp !== 'unknown') {
            return attackerIp;
        }
        // Tags are [(node_id, timestamp), ...], not attacker IPs
        // Return undefined if we can't determine the attacker IP
        return undefined;
    }
    async updateAttacker(attackerIp, state, sourceHost) {
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        let attacker = await models_1.Attacker.findOne({ attackerId });
        if (!attacker) {
            attacker = new models_1.Attacker({
                attackerId,
                ipAddress: attackerIp,
                entryPoint: sourceHost,
                currentPrivilege: 'User',
                riskLevel: 'Medium',
                campaign: this.detectCampaign(state),
                firstSeen: new Date(),
                lastSeen: new Date(),
                dwellTime: 0,
                status: 'Active',
                geolocation: {
                    country: 'Unknown',
                    city: 'Unknown',
                    coordinates: [0, 0]
                }
            });
            logger_1.logger.info(`Created new attacker: ${attackerId} from ${sourceHost}`);
        }
        else {
            attacker.lastSeen = new Date();
            const dwellMs = attacker.lastSeen.getTime() - attacker.firstSeen.getTime();
            attacker.dwellTime = Math.floor(dwellMs / 60000);
            const visitedCount = state.visited_decoys?.elements?.length || 0;
            if (visitedCount > 5)
                attacker.riskLevel = 'Critical';
            else if (visitedCount > 3)
                attacker.riskLevel = 'High';
            else if (visitedCount > 1)
                attacker.riskLevel = 'Medium';
            logger_1.logger.info(`Updated attacker: ${attackerId}, dwellTime: ${attacker.dwellTime}min, risk: ${attacker.riskLevel}`);
        }
        await attacker.save();
        // Process visited decoys - create visit events
        if (state.visited_decoys?.elements) {
            for (const decoy of state.visited_decoys.elements) {
                await this.addVisitEvent(attackerId, decoy, sourceHost);
            }
        }
        // Process actions per decoy
        if (state.actions_per_decoy?.entries) {
            for (const [decoyKey, actionData] of Object.entries(state.actions_per_decoy.entries)) {
                // actionData format: [action, timestamp, node]
                const action = actionData[0];
                const ts = actionData[1];
                const node = actionData[2];
                await this.addActionEvent(attackerId, decoyKey, action, ts, node);
            }
        }
        // Update privilege based on location
        if (state.location?.value) {
            attacker.currentPrivilege = this.inferPrivilege(state.location.value);
            await attacker.save();
        }
        this.emit('attackerUpdated', attacker);
    }
    /**
     * Create a visit event when attacker visits a decoy
     */
    async addVisitEvent(attackerId, decoy, sourceHost) {
        try {
            const attacker = await models_1.Attacker.findOne({ attackerId });
            if (!attacker) {
                logger_1.logger.warn(`Attacker ${attackerId} not found for visit event`);
                return;
            }
            // Check if we already have this visit event to avoid duplicates
            const existingEvent = await models_1.AttackEvent.findOne({
                attackerId,
                targetHost: decoy,
                type: 'Discovery',
                description: { $regex: `visited ${decoy}`, $options: 'i' }
            });
            if (existingEvent) {
                logger_1.logger.debug(`Visit event already exists for ${attackerId} -> ${decoy}`);
                return;
            }
            const event = new models_1.AttackEvent({
                eventId: `visit-${(0, uuid_1.v4)()}`,
                timestamp: new Date(),
                attackerId,
                type: 'Discovery',
                tactic: 'discovery',
                tacticId: 'TA0007',
                tacticName: 'Discovery',
                technique: 'T1018',
                techniqueName: 'Remote System Discovery',
                isSubtechnique: false,
                mitreConfidence: 0.8,
                classificationMethod: 'pattern',
                allMatchingTechniques: ['T1018'],
                description: `Attacker visited decoy: ${decoy}`,
                sourceHost: attacker.ipAddress,
                targetHost: decoy,
                severity: 'Low',
                status: 'Detected'
            });
            await event.save();
            this.emit('newEvent', event);
            logger_1.logger.info(`Created visit event: ${attackerId} -> ${decoy}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to create visit event for ${attackerId} -> ${decoy}:`, error);
        }
    }
    /**
     * Create an action event from attacker activity on a decoy
     */
    async addActionEvent(attackerId, decoy, action, ts, node) {
        try {
            const attacker = await models_1.Attacker.findOne({ attackerId });
            if (!attacker) {
                logger_1.logger.warn(`Attacker ${attackerId} not found for action event`);
                return;
            }
            // Classify the action using MITRE service
            const mitreService = new MitreAttackService_1.MitreAttackService();
            const classification = await mitreService.classifyEvent(action);
            // Map action to event type
            let eventType = 'Discovery';
            let severity = 'Low';
            let technique = classification?.techniqueId || 'T1018';
            let tactic = classification?.tactic || 'discovery';
            let tacticId = classification?.tacticId || 'TA0007';
            let tacticName = classification?.tacticName || 'Discovery';
            let techniqueName = classification?.techniqueName || 'Remote System Discovery';
            // Determine event type and severity based on action content
            const actionLower = action.toLowerCase();
            if (actionLower.includes('login') || actionLower.includes('auth')) {
                eventType = 'Initial Access';
                severity = 'Medium';
                technique = classification?.techniqueId || 'T1078';
                tactic = classification?.tactic || 'initial-access';
                tacticId = classification?.tacticId || 'TA0001';
                tacticName = classification?.tacticName || 'Initial Access';
                techniqueName = classification?.techniqueName || 'Valid Accounts';
            }
            else if (actionLower.includes('privilege') || actionLower.includes('sudo') || actionLower.includes('admin')) {
                eventType = 'Privilege Escalation';
                severity = 'High';
                technique = classification?.techniqueId || 'T1548';
                tactic = classification?.tactic || 'privilege-escalation';
                tacticId = classification?.tacticId || 'TA0004';
                tacticName = classification?.tacticName || 'Privilege Escalation';
                techniqueName = classification?.techniqueName || 'Abuse Elevation Control Mechanism';
            }
            else if (actionLower.includes('credential') || actionLower.includes('password') || actionLower.includes('mimikatz')) {
                eventType = 'Credential Theft';
                severity = 'Critical';
                technique = classification?.techniqueId || 'T1003';
                tactic = classification?.tactic || 'credential-access';
                tacticId = classification?.tacticId || 'TA0006';
                tacticName = classification?.tacticName || 'Credential Access';
                techniqueName = classification?.techniqueName || 'OS Credential Dumping';
            }
            else if (actionLower.includes('lateral') || actionLower.includes('pivot') || actionLower.includes('ssh') || actionLower.includes('rdp')) {
                eventType = 'Lateral Movement';
                severity = 'High';
                technique = classification?.techniqueId || 'T1021';
                tactic = classification?.tactic || 'lateral-movement';
                tacticId = classification?.tacticId || 'TA0008';
                tacticName = classification?.tacticName || 'Lateral Movement';
                techniqueName = classification?.techniqueName || 'Remote Services';
            }
            else if (actionLower.includes('exfil') || actionLower.includes('upload') || actionLower.includes('download')) {
                eventType = 'Data Exfiltration';
                severity = 'Critical';
                technique = classification?.techniqueId || 'T1041';
                tactic = classification?.tactic || 'exfiltration';
                tacticId = classification?.tacticId || 'TA0010';
                tacticName = classification?.tacticName || 'Exfiltration';
                techniqueName = classification?.techniqueName || 'Exfiltration Over C2 Channel';
            }
            // Create the event
            const event = new models_1.AttackEvent({
                eventId: `action-${(0, uuid_1.v4)()}`,
                timestamp: new Date(ts) || new Date(),
                attackerId,
                type: eventType,
                tactic,
                tacticId,
                tacticName,
                technique,
                techniqueName,
                isSubtechnique: classification?.isSubtechnique || false,
                mitreConfidence: classification?.confidence || 0.7,
                classificationMethod: classification?.method === 'fallback' ? 'unknown' : (classification?.method || 'pattern'),
                allMatchingTechniques: classification?.allMatches || [technique],
                commandPatternMatched: action,
                description: action,
                sourceHost: attacker.ipAddress,
                targetHost: decoy,
                severity,
                status: 'Detected'
            });
            await event.save();
            this.emit('newEvent', event);
            logger_1.logger.info(`Created action event: ${attackerId} -> ${decoy}: ${action}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to create action event for ${attackerId} -> ${decoy}:`, error);
        }
    }
    /**
     * Add a stolen credential to the database
     */
    async addCredential(cred, sourceHost, attackerIp) {
        try {
            // Parse credential string (format: "username:password")
            const parts = cred.split(':');
            if (parts.length < 2) {
                logger_1.logger.warn(`Invalid credential format: ${cred}`);
                return;
            }
            const username = parts[0];
            const password = parts.slice(1).join(':'); // Handle passwords with colons
            // Find the attacker by IP - search through active attackers
            let attackerId;
            if (attackerIp && attackerIp !== 'unknown') {
                const attacker = await models_1.Attacker.findOne({ ipAddress: attackerIp });
                if (attacker) {
                    attackerId = attacker.attackerId;
                }
            }
            // If no attacker found by IP, try to find the most recent active attacker from this host
            if (!attackerId) {
                const recentAttacker = await models_1.Attacker.findOne({
                    entryPoint: sourceHost,
                    status: 'Active'
                }).sort({ lastSeen: -1 });
                if (recentAttacker) {
                    attackerId = recentAttacker.attackerId;
                }
            }
            if (!attackerId) {
                logger_1.logger.warn(`No attacker found for credential: ${cred} from ${sourceHost}`);
                return;
            }
            // Check for duplicate credential
            const existingCred = await models_1.Credential.findOne({
                attackerId,
                username,
                password
            });
            if (existingCred) {
                logger_1.logger.debug(`Credential already exists: ${username} from ${attackerId}`);
                return;
            }
            // Calculate risk score based on username
            let riskScore = 50;
            if (username.includes('admin') || username.includes('root') || username.includes('administrator')) {
                riskScore = 90;
            }
            else if (username.includes('service') || username.includes('svc') || username.includes('system')) {
                riskScore = 75;
            }
            else if (username.includes('db') || username.includes('sql') || username.includes('database')) {
                riskScore = 70;
            }
            const credential = new models_1.Credential({
                credentialId: `cred-${(0, uuid_1.v4)()}`,
                username,
                password,
                source: sourceHost,
                attackerId,
                decoyHost: sourceHost,
                timestamp: new Date(),
                usageCount: 0,
                status: 'Stolen',
                riskScore
            });
            await credential.save();
            logger_1.logger.info(`Created credential: ${username} for attacker ${attackerId}`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to create credential from ${sourceHost}:`, error);
        }
    }
    /**
     * Create a session event for active attacker sessions
     */
    async addSessionEvent(sessionId, host, node, ts) {
        try {
            // Find attacker by node/host
            const attacker = await models_1.Attacker.findOne({
                entryPoint: host,
                status: 'Active'
            }).sort({ lastSeen: -1 });
            if (!attacker) {
                logger_1.logger.debug(`No active attacker found for session on ${host}`);
                return;
            }
            // Create a lateral movement event to represent the session
            const movement = new models_1.LateralMovement({
                movementId: `session-${(0, uuid_1.v4)()}`,
                attackerId: attacker.attackerId,
                timestamp: new Date(ts) || new Date(),
                sourceHost: attacker.entryPoint,
                targetHost: host,
                technique: 'T1021',
                method: 'SSH',
                successful: true,
                credentialsUsed: sessionId
            });
            await movement.save();
            logger_1.logger.info(`Created session event: ${attacker.attackerId} -> ${host} (session: ${sessionId})`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to create session event for ${host}:`, error);
        }
    }
    /**
     * Detect campaign name from CRDT state
     */
    detectCampaign(state) {
        // Analyze state for campaign indicators
        if (state.actions_per_decoy?.entries) {
            const actions = Object.values(state.actions_per_decoy.entries);
            const actionStrings = actions.map(a => a[0]?.toLowerCase() || '');
            if (actionStrings.some(a => a.includes('mimikatz') || a.includes('credential'))) {
                return 'Credential Harvesting Campaign';
            }
            if (actionStrings.some(a => a.includes('lateral') || a.includes('pivot'))) {
                return 'Lateral Movement Campaign';
            }
            if (actionStrings.some(a => a.includes('exfil') || a.includes('upload'))) {
                return 'Data Exfiltration Campaign';
            }
        }
        // Default based on visited decoys count
        const visitedCount = state.visited_decoys?.elements?.length || 0;
        if (visitedCount > 5) {
            return 'Persistent Threat Campaign';
        }
        if (visitedCount > 2) {
            return 'Reconnaissance Campaign';
        }
        return 'Opportunistic';
    }
    /**
     * Infer privilege level from location/activity data
     */
    inferPrivilege(location) {
        const locationLower = location.toLowerCase();
        if (locationLower.includes('root') || locationLower.includes('admin') || locationLower.includes('system')) {
            return 'Admin';
        }
        if (locationLower.includes('service') || locationLower.includes('svc')) {
            return 'Service';
        }
        if (locationLower.includes('guest')) {
            return 'Guest';
        }
        return 'User';
    }
}
exports.CRDTSyncService = CRDTSyncService;
//# sourceMappingURL=CRDTSyncService.js.map