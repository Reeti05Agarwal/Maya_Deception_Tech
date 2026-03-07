"use strict";
// services/RealSimulationService.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealSimulationService = void 0;
const events_1 = require("events");
const models_1 = require("../models");
const logger_1 = require("../utils/logger");
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const MitreAttackService_1 = require("./MitreAttackService");
const VMStatus_1 = __importDefault(require("../models/VMStatus"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class RealSimulationService extends events_1.EventEmitter {
    constructor() {
        super();
        this.vmCache = new Map();
        // Use absolute path from project root
        this.vagrantDir = process.env.VAGRANT_DIR || path.join(__dirname, '../../../simulations/fake');
        this.mitreService = new MitreAttackService_1.MitreAttackService();
        this.discoverVMs();
    }
    /**
     * Helper method to handle simulation errors consistently
     * Returns a standardized error result with proper logging
     */
    handleSimulationError(simulationType, error, mockFallback) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger_1.logger.error(`Real ${simulationType} simulation failed:`, errorMessage);
        // If a mock fallback is provided, use it
        if (mockFallback) {
            logger_1.logger.warn(`Falling back to mock ${simulationType} simulation`);
            return mockFallback();
        }
        // Otherwise return standardized error result
        return Promise.resolve({
            success: false,
            error: errorMessage,
            real: false
        });
    }
    /**
     * Discover running VMs - always use vagrant-based discovery for accuracy
     * Database is used as a secondary source, but we verify actual VM status
     */
    async discoverVMs() {
        // Clear cache before rediscovery
        this.vmCache.clear();
        // PRIMARY: Always use vagrant-based discovery for accurate, real-time status
        await this.discoverVMsFromVagrant();
        logger_1.logger.info(`VM cache populated with ${this.vmCache.size} VMs`);
    }
    /**
     * Discover running VMs via vagrant commands and virsh (using correct domain naming)
     * Based on simulations/fake/check_vms.sh script
     */
    async discoverVMsFromVagrant() {
        if (!fs.existsSync(this.vagrantDir)) {
            logger_1.logger.warn(`Vagrant directory not found: ${this.vagrantDir}`);
            return;
        }
        logger_1.logger.info(`Scanning for VMs in: ${this.vagrantDir}`);
        // List of VMs to check (from check_vms.sh)
        const vmNames = [
            'gateway-vm',
            'fake-ftp-01', 'fake-jump-01', 'fake-rdp-01', 'fake-smb-01',
            'fake-ssh-01', 'fake-web-01', 'fake-web-02', 'fake-web-03'
        ];
        logger_1.logger.info(`Checking ${vmNames.length} VMs: [${vmNames.join(', ')}]`);
        for (const vmName of vmNames) {
            const vmPath = path.join(this.vagrantDir, vmName);
            // Check if directory exists
            if (!fs.existsSync(vmPath)) {
                logger_1.logger.debug(`Skipping ${vmName}: directory not found`);
                continue;
            }
            // Check if Vagrantfile exists
            if (!fs.existsSync(path.join(vmPath, 'Vagrantfile'))) {
                logger_1.logger.warn(`Skipping ${vmName}: no Vagrantfile found`);
                continue;
            }
            let isRunning = false;
            let ip = null;
            let virshState = null;
            try {
                // Step 1: Get status from vagrant (primary method)
                const { stdout: statusOutput } = await execAsync(`cd ${vmPath} && timeout 10 vagrant status --machine-readable 2>/dev/null || echo ""`, { timeout: 12000 });
                // Parse machine-readable format: timestamp,provider,state,state-short,state-long
                const statusLine = statusOutput.split('\n').find(line => line.includes(',state,') && !line.includes('state-human'));
                if (statusLine) {
                    const parts = statusLine.split(',');
                    if (parts.length >= 4) {
                        const vagrantState = parts[3].trim();
                        isRunning = vagrantState === 'running';
                        logger_1.logger.debug(`vagrant status ${vmName}: ${vagrantState}`);
                    }
                }
                // Step 2: Get virsh status for additional detail (using correct domain name: vmName_default)
                try {
                    const domainName = `${vmName}_default`;
                    const { stdout: virshOutput } = await execAsync(`virsh domstate ${domainName} 2>/dev/null || echo ""`, { timeout: 3000 });
                    virshState = virshOutput.trim() || null;
                    if (virshState) {
                        logger_1.logger.debug(`virsh domstate ${domainName}: ${virshState}`);
                        // If virsh shows running but vagrant doesn't, trust virsh
                        if (virshState.toLowerCase() === 'running' && !isRunning) {
                            logger_1.logger.warn(`vagrant says ${vmName} is not running, but virsh says running - trusting virsh`);
                            isRunning = true;
                        }
                    }
                }
                catch (virshError) {
                    logger_1.logger.debug(`virsh check failed for ${vmName}: ${virshError.message}`);
                }
                // Step 3: If running, get IP address
                if (isRunning) {
                    try {
                        const { stdout: ipOutput } = await execAsync(`cd ${vmPath} && timeout 5 vagrant ssh -c "hostname -I | awk '{print \\$1}'" 2>/dev/null || echo ""`, { timeout: 7000 });
                        ip = ipOutput.trim() || null;
                        // Clean up IP output (remove carriage returns)
                        if (ip) {
                            ip = ip.replace(/\r/g, '').split(' ')[0]; // Take first IP only
                            logger_1.logger.info(`✅ ${vmName}: running (virsh: ${virshState || 'unknown'}, IP: ${ip})`);
                        }
                        else {
                            logger_1.logger.warn(`⚠️  ${vmName}: running but no IP (still booting?)`);
                            ip = 'unknown';
                        }
                    }
                    catch (ipError) {
                        logger_1.logger.warn(`Could not get IP for ${vmName}: ${ipError.message}`);
                        ip = 'unknown';
                    }
                    // Add to cache
                    this.vmCache.set(vmName, { path: vmPath, ip: ip || 'unknown' });
                }
                else {
                    logger_1.logger.debug(`VM ${vmName} is not running (vagrant: ${statusOutput ? 'checked' : 'error'}, virsh: ${virshState || 'unknown'})`);
                }
                // Update database as secondary (for CRDT sync service)
                await VMStatus_1.default.findOneAndUpdate({ vmName }, {
                    vmName,
                    hostname: vmName,
                    status: isRunning ? 'running' : 'stopped',
                    ip: ip,
                    lastSeen: new Date(),
                    crdtState: isRunning ? undefined : { attackers: 0, credentials: 0, sessions: 0, hash: '' }
                }, { upsert: true, new: true });
            }
            catch (error) {
                logger_1.logger.error(`❌ Failed to discover VM ${vmName}:`, error.message);
                // Mark as error in DB
                await VMStatus_1.default.findOneAndUpdate({ vmName }, {
                    vmName,
                    hostname: vmName,
                    status: 'error',
                    ip: null,
                    lastSeen: new Date(),
                    crdtState: { attackers: 0, credentials: 0, sessions: 0, hash: '' }
                }, { upsert: true });
            }
        }
        logger_1.logger.info(`VM discovery complete: ${this.vmCache.size} running VMs cached`);
    }
    /**
     * Execute command on VM via SSH
     */
    async executeOnVM(vmName, command) {
        const vmInfo = this.vmCache.get(vmName);
        if (!vmInfo) {
            throw new Error(`VM ${vmName} not found or not running`);
        }
        const { stdout, stderr } = await execAsync(`cd ${vmInfo.path} && timeout 10 vagrant ssh -c "${command}" 2>/dev/null`, { timeout: 12000 });
        return { stdout, stderr };
    }
    /**
     * Simulate REAL SSH brute force attack with MITRE classification
     */
    async simulateSSHBruteForce(params) {
        const { target, attempts = 5 } = params;
        logger_1.logger.info(`Checking VM cache for target '${target}': ${this.vmCache.has(target) ? 'FOUND' : 'NOT FOUND'}`);
        logger_1.logger.info(`Available VMs in cache: [${Array.from(this.vmCache.keys()).join(', ')}]`);
        if (!this.vmCache.has(target)) {
            logger_1.logger.warn(`Target VM ${target} not running, using mock data`);
            return this.simulateSSHBruteForceMock(target, attempts);
        }
        logger_1.logger.info(`🎯 Starting REAL SSH brute force simulation on ${target}`);
        const attackerIp = `10.20.10.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        let eventsGenerated = 0;
        try {
            const attacker = new models_1.Attacker({
                attackerId,
                ipAddress: attackerIp,
                entryPoint: target,
                currentPrivilege: 'User',
                riskLevel: 'Medium',
                campaign: 'Simulated Attack',
                firstSeen: new Date(),
                lastSeen: new Date(),
                dwellTime: 0,
                status: 'Active'
            });
            await attacker.save();
            this.emit('attackerUpdated', attacker);
            // Execute SSH commands and classify with MITRE
            for (let i = 0; i < attempts; i++) {
                const fakeUser = `user${Math.floor(Math.random() * 100)}`;
                try {
                    await this.executeOnVM(target, `sshpass -p 'fakepass' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 ${fakeUser}@localhost 2>&1 || true`);
                }
                catch (e) {
                    // Expected to fail
                }
                await this.executeOnVM(target, `/usr/local/bin/syslogd-helper observe "Failed SSH login attempt ${i + 1}/${attempts} from ${attackerIp}"`);
                // CLASSIFY with MITRE - SSH brute force is T1110
                const classification = await this.mitreService.classifyEvent('ssh brute force');
                const event = new models_1.AttackEvent({
                    eventId: `evt-${(0, uuid_1.v4)()}`,
                    timestamp: new Date(),
                    attackerId,
                    type: 'Initial Access',
                    // NEW MITRE FIELDS
                    tactic: classification?.tactic || 'initial-access',
                    tacticId: classification?.tacticId || 'TA0001',
                    tacticName: classification?.tacticName || 'Initial Access',
                    technique: classification?.techniqueId || 'T1110',
                    techniqueName: classification?.techniqueName || 'Brute Force',
                    isSubtechnique: classification?.isSubtechnique || false,
                    mitreConfidence: classification?.confidence || 0.7,
                    classificationMethod: classification?.method || 'pattern',
                    allMatchingTechniques: classification?.allMatches || ['T1110'],
                    // LEGACY FIELDS
                    description: `Failed SSH login attempt ${i + 1}/${attempts}`,
                    sourceHost: attackerIp,
                    targetHost: target,
                    severity: i >= attempts - 1 ? 'High' : 'Medium',
                    status: 'Detected'
                });
                await event.save();
                this.emit('newEvent', event);
                eventsGenerated++;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            // Successful login - classify the success
            const username = 'vagrant';
            const password = 'vagrant';
            await this.executeOnVM(target, `/usr/local/bin/syslogd-helper observe "Successful SSH login with credentials: ${username}:${password}"`);
            await models_1.Credential.create({
                credentialId: `cred-${(0, uuid_1.v4)()}`,
                username,
                password,
                source: target,
                attackerId,
                decoyHost: target,
                status: 'Stolen',
                riskScore: 65,
                usageCount: 1,
                lastUsed: new Date()
            });
            // CLASSIFY successful access - T1078 (Valid Accounts)
            const successClassification = await this.mitreService.classifyEvent('ssh login successful');
            const successEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                timestamp: new Date(),
                attackerId,
                type: 'Initial Access',
                tactic: successClassification?.tactic || 'initial-access',
                tacticId: successClassification?.tacticId || 'TA0001',
                tacticName: successClassification?.tacticName || 'Initial Access',
                technique: successClassification?.techniqueId || 'T1078',
                techniqueName: successClassification?.techniqueName || 'Valid Accounts',
                isSubtechnique: successClassification?.isSubtechnique || false,
                mitreConfidence: successClassification?.confidence || 0.8,
                classificationMethod: successClassification?.method || 'pattern',
                allMatchingTechniques: successClassification?.allMatches || ['T1078'],
                description: `Successful SSH login with credentials: ${username}`,
                sourceHost: attackerIp,
                targetHost: target,
                severity: 'High',
                status: 'Detected'
            });
            await successEvent.save();
            this.emit('newEvent', successEvent);
            eventsGenerated++;
            await this.executeOnVM(target, '/usr/local/bin/syslogd-helper sync >/dev/null 2>&1 &');
            this.emit('simulationComplete', {
                type: 'ssh-bruteforce',
                attackerId,
                target,
                eventsGenerated,
                real: true
            });
            return { success: true, attackerId, eventsGenerated, real: true };
        }
        catch (error) {
            logger_1.logger.error('Real SSH brute force simulation failed:', error);
            return this.simulateSSHBruteForceMock(target, attempts);
        }
    }
    /**
     * Mock fallback if VM not available
     */
    async simulateSSHBruteForceMock(target, attempts) {
        logger_1.logger.warn(`Using MOCK SSH brute force simulation for ${target}`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        const attacker = new models_1.Attacker({
            attackerId,
            ipAddress: attackerIp,
            entryPoint: target,
            currentPrivilege: 'User',
            riskLevel: 'Medium',
            campaign: 'Simulated Attack',
            firstSeen: new Date(),
            lastSeen: new Date(),
            dwellTime: 0,
            status: 'Active'
        });
        await attacker.save();
        for (let i = 0; i < attempts; i++) {
            const classification = await this.mitreService.classifyEvent('ssh brute force');
            const event = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                timestamp: new Date(),
                attackerId,
                type: 'Initial Access',
                tactic: classification?.tactic || 'initial-access',
                tacticId: classification?.tacticId || 'TA0001',
                tacticName: classification?.tacticName || 'Initial Access',
                technique: classification?.techniqueId || 'T1110',
                techniqueName: classification?.techniqueName || 'Brute Force',
                mitreConfidence: classification?.confidence || 0.7,
                classificationMethod: classification?.method || 'pattern',
                description: `Failed SSH login attempt ${i + 1}/${attempts} (MOCK)`,
                sourceHost: attackerIp,
                targetHost: target,
                severity: i >= attempts - 1 ? 'High' : 'Medium',
                status: 'Detected'
            });
            await event.save();
        }
        return { success: true, attackerId, eventsGenerated: attempts, real: false };
    }
    /**
     * Simulate REAL lateral movement with MITRE classification
     */
    async simulateLateralMovement(params) {
        const { source, targets } = params;
        const availableSource = this.vmCache.has(source);
        const availableTargets = targets.filter(t => this.vmCache.has(t));
        if (!availableSource || availableTargets.length === 0) {
            logger_1.logger.warn('Source or target VMs not running, using mock data');
            return { success: false, reason: 'VMs not available' };
        }
        logger_1.logger.info(`🎯 Starting REAL lateral movement simulation: ${source} → [${availableTargets.join(', ')}]`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        let eventsGenerated = 0;
        try {
            const attacker = new models_1.Attacker({
                attackerId,
                ipAddress: attackerIp,
                entryPoint: source,
                currentPrivilege: 'User',
                riskLevel: 'High',
                campaign: 'Simulated Attack',
                firstSeen: new Date(),
                lastSeen: new Date(),
                dwellTime: 0,
                status: 'Active'
            });
            await attacker.save();
            this.emit('attackerUpdated', attacker);
            // Initial access on source
            await this.executeOnVM(source, `/usr/local/bin/syslogd-helper observe "Initial compromise from ${attackerIp}"`);
            const initialClassification = await this.mitreService.classifyEvent('initial compromise');
            const initialEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Initial Access',
                tactic: initialClassification?.tactic || 'initial-access',
                tacticId: initialClassification?.tacticId || 'TA0001',
                tacticName: initialClassification?.tacticName || 'Initial Access',
                technique: initialClassification?.techniqueId || 'T1078',
                techniqueName: initialClassification?.techniqueName || 'Valid Accounts',
                isSubtechnique: initialClassification?.isSubtechnique || false,
                mitreConfidence: initialClassification?.confidence || 0.7,
                classificationMethod: initialClassification?.method || 'pattern',
                allMatchingTechniques: initialClassification?.allMatches || ['T1078'],
                description: `Initial compromise of ${source}`,
                sourceHost: attackerIp,
                targetHost: source,
                severity: 'High',
                status: 'Detected'
            });
            await initialEvent.save();
            this.emit('newEvent', initialEvent);
            eventsGenerated++;
            // Lateral movement to each target
            let currentHost = source;
            for (const target of availableTargets) {
                try {
                    await this.executeOnVM(currentHost, `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 vagrant@${this.vmCache.get(target).ip} "whoami" 2>&1 || true`);
                }
                catch (e) {
                    // Connection attempt logged
                }
                await this.executeOnVM(currentHost, `/usr/local/bin/syslogd-helper observe "SSH pivot from ${currentHost} to ${target}"`);
                await this.executeOnVM(target, `/usr/local/bin/syslogd-helper visit "${attackerIp}" "${target}"`);
                // CLASSIFY lateral movement - T1021 (Remote Services)
                const moveClassification = await this.mitreService.classifyEvent('ssh pivot lateral movement');
                const moveEvent = new models_1.AttackEvent({
                    eventId: `evt-${(0, uuid_1.v4)()}`,
                    attackerId,
                    type: 'Lateral Movement',
                    tactic: moveClassification?.tactic || 'lateral-movement',
                    tacticId: moveClassification?.tacticId || 'TA0008',
                    tacticName: moveClassification?.tacticName || 'Lateral Movement',
                    technique: moveClassification?.techniqueId || 'T1021',
                    techniqueName: moveClassification?.techniqueName || 'Remote Services',
                    isSubtechnique: moveClassification?.isSubtechnique || false,
                    mitreConfidence: moveClassification?.confidence || 0.8,
                    classificationMethod: moveClassification?.method || 'pattern',
                    allMatchingTechniques: moveClassification?.allMatches || ['T1021'],
                    description: `SSH pivot from ${currentHost} to ${target}`,
                    sourceHost: currentHost,
                    targetHost: target,
                    severity: 'High',
                    status: 'Detected'
                });
                await moveEvent.save();
                this.emit('newEvent', moveEvent);
                eventsGenerated++;
                await models_1.LateralMovement.create({
                    movementId: `mov-${(0, uuid_1.v4)()}`,
                    attackerId,
                    sourceHost: currentHost,
                    targetHost: target,
                    technique: moveEvent.technique,
                    method: 'SSH',
                    successful: true
                });
                currentHost = target;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            attacker.currentPrivilege = 'Admin';
            attacker.riskLevel = 'Critical';
            await attacker.save();
            for (const vm of [source, ...availableTargets]) {
                await this.executeOnVM(vm, '/usr/local/bin/syslogd-helper sync >/dev/null 2>&1 &');
            }
            this.emit('simulationComplete', {
                type: 'lateral-movement',
                attackerId,
                path: [source, ...availableTargets],
                eventsGenerated,
                real: true
            });
            return { success: true, attackerId, path: [source, ...availableTargets], real: true };
        }
        catch (error) {
            return this.handleSimulationError('lateral movement', error, async () => {
                logger_1.logger.warn('Using mock lateral movement simulation as fallback');
                return {
                    success: false,
                    reason: error.message,
                    real: false,
                    attackerId: undefined,
                    path: []
                };
            });
        }
    }
    /**
     * Simulate REAL credential dumping with MITRE classification
     */
    async simulateCredentialTheft(params) {
        const { target, tool = 'mimikatz' } = params;
        if (!this.vmCache.has(target)) {
            return { success: false, reason: 'VM not available' };
        }
        logger_1.logger.info(`🎯 Starting REAL credential theft simulation on ${target}`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        let eventsGenerated = 0;
        try {
            const attacker = new models_1.Attacker({
                attackerId,
                ipAddress: attackerIp,
                entryPoint: target,
                currentPrivilege: 'Admin',
                riskLevel: 'Critical',
                campaign: 'Simulated Attack',
                firstSeen: new Date(),
                lastSeen: new Date(),
                dwellTime: 0,
                status: 'Active'
            });
            await attacker.save();
            this.emit('attackerUpdated', attacker);
            // Execute mimikatz-like command
            const mimikatzCommand = `${tool} sekurlsa::logonpasswords`;
            await this.executeOnVM(target, `/usr/local/bin/syslogd-helper observe "${tool} execution detected - dumping credentials"`);
            // CLASSIFY credential dumping - T1003 (OS Credential Dumping)
            const dumpClassification = await this.mitreService.classifyEvent(mimikatzCommand);
            const dumpEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Credential Theft',
                tactic: dumpClassification?.tactic || 'credential-access',
                tacticId: dumpClassification?.tacticId || 'TA0006',
                tacticName: dumpClassification?.tacticName || 'Credential Access',
                technique: dumpClassification?.techniqueId || 'T1003',
                techniqueName: dumpClassification?.techniqueName || 'OS Credential Dumping',
                isSubtechnique: dumpClassification?.isSubtechnique || false,
                mitreConfidence: dumpClassification?.confidence || 0.95,
                classificationMethod: dumpClassification?.method || 'exact',
                allMatchingTechniques: dumpClassification?.allMatches || ['T1003', 'T1003.001'],
                command: mimikatzCommand,
                description: `${tool} execution detected - dumping credentials`,
                sourceHost: target,
                targetHost: target,
                severity: 'Critical',
                status: 'Detected'
            });
            await dumpEvent.save();
            this.emit('newEvent', dumpEvent);
            eventsGenerated++;
            // Create stolen credentials
            const stolenCreds = [
                { username: 'admin', password: 'Admin123!' },
                { username: 'root', password: 'root123' },
                { username: 'dbuser', password: 'dbpass123' }
            ];
            for (const cred of stolenCreds) {
                await this.executeOnVM(target, `/usr/local/bin/syslogd-helper cred "${cred.username}:${cred.password}"`);
                await models_1.Credential.create({
                    credentialId: `cred-${(0, uuid_1.v4)()}`,
                    username: cred.username,
                    password: cred.password,
                    source: target,
                    attackerId,
                    decoyHost: target,
                    status: 'Stolen',
                    riskScore: cred.username.includes('admin') || cred.username === 'root' ? 90 : 70
                });
                // Each credential theft is also T1003
                const credClassification = await this.mitreService.classifyEvent('credential theft');
                const credEvent = new models_1.AttackEvent({
                    eventId: `evt-${(0, uuid_1.v4)()}`,
                    attackerId,
                    type: 'Credential Theft',
                    tactic: credClassification?.tactic || 'credential-access',
                    tacticId: credClassification?.tacticId || 'TA0006',
                    tacticName: credClassification?.tacticName || 'Credential Access',
                    technique: credClassification?.techniqueId || 'T1003',
                    techniqueName: credClassification?.techniqueName || 'OS Credential Dumping',
                    isSubtechnique: credClassification?.isSubtechnique || false,
                    mitreConfidence: credClassification?.confidence || 0.9,
                    classificationMethod: credClassification?.method || 'pattern',
                    allMatchingTechniques: credClassification?.allMatches || ['T1003'],
                    description: `Credential stolen: ${cred.username}`,
                    sourceHost: target,
                    targetHost: target,
                    severity: 'Critical',
                    status: 'Detected'
                });
                await credEvent.save();
                this.emit('newEvent', credEvent);
                eventsGenerated++;
            }
            await this.executeOnVM(target, '/usr/local/bin/syslogd-helper sync >/dev/null 2>&1 &');
            this.emit('simulationComplete', {
                type: 'credential-theft',
                attackerId,
                target,
                credentialsStolen: stolenCreds.length,
                eventsGenerated,
                real: true
            });
            return { success: true, attackerId, credentialsStolen: stolenCreds.length, real: true };
        }
        catch (error) {
            return this.handleSimulationError('credential theft', error, async () => {
                logger_1.logger.warn('Using mock credential theft simulation as fallback');
                return {
                    success: false,
                    reason: error.message,
                    real: false,
                    attackerId: undefined,
                    credentialsStolen: 0
                };
            });
        }
    }
    /**
     * Simulate REAL network discovery with MITRE classification
     */
    async simulateDiscovery(params) {
        const { source, scanType = 'internal' } = params;
        if (!this.vmCache.has(source)) {
            logger_1.logger.warn(`Source VM ${source} not running, using mock data`);
            return this.simulateDiscoveryMock(source, scanType);
        }
        logger_1.logger.info(`🎯 Starting REAL network discovery simulation from ${source}`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        let eventsGenerated = 0;
        try {
            const attacker = new models_1.Attacker({
                attackerId,
                ipAddress: attackerIp,
                entryPoint: source,
                currentPrivilege: 'User',
                riskLevel: 'Medium',
                campaign: 'Simulated Attack',
                firstSeen: new Date(),
                lastSeen: new Date(),
                dwellTime: 0,
                status: 'Active'
            });
            await attacker.save();
            this.emit('attackerUpdated', attacker);
            const discoveryCommands = [
                { cmd: 'nmap -sS -sV 10.20.20.0/24', technique: 'T1046', tactic: 'discovery', desc: 'Network service discovery' },
                { cmd: 'netstat -tulpn', technique: 'T1049', tactic: 'discovery', desc: 'System network connections' },
                { cmd: 'cat /etc/passwd', technique: 'T1087', tactic: 'discovery', desc: 'Account discovery' },
                { cmd: 'find / -name "*.conf" 2>/dev/null', technique: 'T1083', tactic: 'discovery', desc: 'File and directory discovery' },
                { cmd: 'ps aux | grep -E "(ssh|http|mysql|postgres)"', technique: 'T1057', tactic: 'discovery', desc: 'Process discovery' },
                { cmd: 'ifconfig -a', technique: 'T1016', tactic: 'discovery', desc: 'System network configuration discovery' },
                { cmd: 'cat /etc/hosts', technique: 'T1016', tactic: 'discovery', desc: 'Host file discovery' }
            ];
            for (const { cmd, technique, tactic, desc } of discoveryCommands) {
                try {
                    await this.executeOnVM(source, cmd);
                }
                catch (e) {
                    // Command may fail, still log it
                }
                await this.executeOnVM(source, `/usr/local/bin/syslogd-helper observe "Discovery command: ${cmd.substring(0, 40)}..."`);
                const classification = await this.mitreService.classifyEvent(cmd);
                const event = new models_1.AttackEvent({
                    eventId: `evt-${(0, uuid_1.v4)()}`,
                    timestamp: new Date(),
                    attackerId,
                    type: 'Discovery',
                    tactic: classification?.tactic || tactic,
                    tacticId: classification?.tacticId || 'TA0007',
                    tacticName: classification?.tacticName || 'Discovery',
                    technique: classification?.techniqueId || technique,
                    techniqueName: classification?.techniqueName || desc,
                    isSubtechnique: classification?.isSubtechnique || false,
                    mitreConfidence: classification?.confidence || 0.8,
                    classificationMethod: classification?.method || 'pattern',
                    allMatchingTechniques: classification?.allMatches || [technique],
                    command: cmd,
                    description: desc,
                    sourceHost: source,
                    targetHost: source,
                    severity: 'Low',
                    status: 'Detected'
                });
                await event.save();
                this.emit('newEvent', event);
                eventsGenerated++;
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            await this.executeOnVM(source, '/usr/local/bin/syslogd-helper sync >/dev/null 2>&1 &');
            this.emit('simulationComplete', {
                type: 'discovery',
                attackerId,
                source,
                eventsGenerated,
                real: true
            });
            return { success: true, attackerId, commandsExecuted: discoveryCommands.length, real: true };
        }
        catch (error) {
            logger_1.logger.error('Real discovery simulation failed:', error);
            return this.simulateDiscoveryMock(source, scanType);
        }
    }
    /**
     * Mock discovery simulation
     */
    async simulateDiscoveryMock(source, scanType) {
        logger_1.logger.warn(`Using MOCK discovery simulation for ${source}`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        const attacker = new models_1.Attacker({
            attackerId,
            ipAddress: attackerIp,
            entryPoint: source,
            currentPrivilege: 'User',
            riskLevel: 'Medium',
            campaign: 'Simulated Attack',
            firstSeen: new Date(),
            lastSeen: new Date(),
            dwellTime: 0,
            status: 'Active'
        });
        await attacker.save();
        const discoveryCommands = [
            { cmd: 'nmap -sS -sV 10.20.20.0/24', technique: 'T1046' },
            { cmd: 'netstat -tulpn', technique: 'T1049' },
            { cmd: 'cat /etc/passwd', technique: 'T1087' }
        ];
        for (const { cmd, technique } of discoveryCommands) {
            const classification = await this.mitreService.classifyEvent(cmd);
            const event = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                timestamp: new Date(),
                attackerId,
                type: 'Discovery',
                tactic: classification?.tactic || 'discovery',
                tacticId: classification?.tacticId || 'TA0007',
                tacticName: classification?.tacticName || 'Discovery',
                technique: classification?.techniqueId || technique,
                techniqueName: classification?.techniqueName || technique,
                mitreConfidence: classification?.confidence || 0.7,
                classificationMethod: classification?.method || 'pattern',
                command: cmd,
                description: `Discovery command (MOCK): ${cmd}`,
                sourceHost: source,
                targetHost: source,
                severity: 'Low',
                status: 'Detected'
            });
            await event.save();
        }
        return { success: true, attackerId, commandsExecuted: discoveryCommands.length, real: false };
    }
    /**
     * Simulate REAL privilege escalation with MITRE classification
     */
    async simulatePrivilegeEscalation(params) {
        const { target, method = 'sudo-exploit' } = params;
        if (!this.vmCache.has(target)) {
            logger_1.logger.warn(`Target VM ${target} not running, using mock data`);
            return this.simulatePrivilegeEscalationMock(target, method);
        }
        logger_1.logger.info(`🎯 Starting REAL privilege escalation simulation on ${target}`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        let eventsGenerated = 0;
        try {
            const attacker = new models_1.Attacker({
                attackerId,
                ipAddress: attackerIp,
                entryPoint: target,
                currentPrivilege: 'User',
                riskLevel: 'High',
                campaign: 'Simulated Attack',
                firstSeen: new Date(),
                lastSeen: new Date(),
                dwellTime: 0,
                status: 'Active'
            });
            await attacker.save();
            this.emit('attackerUpdated', attacker);
            // Initial user-level access
            await this.executeOnVM(target, `/usr/local/bin/syslogd-helper observe "Initial user-level access to ${target}"`);
            const initialClassification = await this.mitreService.classifyEvent('initial user access');
            const initialEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Initial Access',
                tactic: initialClassification?.tactic || 'initial-access',
                tacticId: initialClassification?.tacticId || 'TA0001',
                tacticName: initialClassification?.tacticName || 'Initial Access',
                technique: initialClassification?.techniqueId || 'T1078',
                techniqueName: initialClassification?.techniqueName || 'Valid Accounts',
                isSubtechnique: initialClassification?.isSubtechnique || false,
                mitreConfidence: initialClassification?.confidence || 0.7,
                classificationMethod: initialClassification?.method || 'pattern',
                allMatchingTechniques: initialClassification?.allMatches || ['T1078'],
                description: `Initial user-level access to ${target}`,
                sourceHost: attackerIp,
                targetHost: target,
                severity: 'Medium',
                status: 'Detected'
            });
            await initialEvent.save();
            this.emit('newEvent', initialEvent);
            eventsGenerated++;
            // Privilege escalation attempt
            const escalationCommand = method === 'sudo-exploit' ? 'sudo -l && CVE-2021-3156 exploit' : method;
            await this.executeOnVM(target, escalationCommand);
            await this.executeOnVM(target, `/usr/local/bin/syslogd-helper observe "Privilege escalation attempt: ${method}"`);
            const escalateClassification = await this.mitreService.classifyEvent(method);
            const escalateEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Privilege Escalation',
                tactic: escalateClassification?.tactic || 'privilege-escalation',
                tacticId: escalateClassification?.tacticId || 'TA0004',
                tacticName: escalateClassification?.tacticName || 'Privilege Escalation',
                technique: escalateClassification?.techniqueId || 'T1068',
                techniqueName: escalateClassification?.techniqueName || 'Exploitation for Privilege Escalation',
                isSubtechnique: escalateClassification?.isSubtechnique || false,
                mitreConfidence: escalateClassification?.confidence || 0.85,
                classificationMethod: escalateClassification?.method || 'pattern',
                allMatchingTechniques: escalateClassification?.allMatches || ['T1068'],
                description: `${method} attempt detected`,
                sourceHost: target,
                targetHost: target,
                severity: 'High',
                status: 'Detected',
                command: escalationCommand
            });
            await escalateEvent.save();
            this.emit('newEvent', escalateEvent);
            eventsGenerated++;
            // Successful escalation
            await this.executeOnVM(target, `/usr/local/bin/syslogd-helper observe "Successfully escalated to root privileges"`);
            const successClassification = await this.mitreService.classifyEvent('privilege escalation successful');
            const successEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Privilege Escalation',
                tactic: successClassification?.tactic || 'privilege-escalation',
                tacticId: successClassification?.tacticId || 'TA0004',
                tacticName: successClassification?.tacticName || 'Privilege Escalation',
                technique: successClassification?.techniqueId || 'T1078',
                techniqueName: successClassification?.techniqueName || 'Valid Accounts',
                isSubtechnique: successClassification?.isSubtechnique || false,
                mitreConfidence: successClassification?.confidence || 0.9,
                classificationMethod: successClassification?.method || 'pattern',
                allMatchingTechniques: successClassification?.allMatches || ['T1078'],
                description: `Successfully escalated to root/Administrator privileges`,
                sourceHost: target,
                targetHost: target,
                severity: 'Critical',
                status: 'Detected'
            });
            await successEvent.save();
            this.emit('newEvent', successEvent);
            eventsGenerated++;
            // Update attacker privilege
            attacker.currentPrivilege = 'Admin';
            attacker.riskLevel = 'Critical';
            await attacker.save();
            await this.executeOnVM(target, '/usr/local/bin/syslogd-helper sync >/dev/null 2>&1 &');
            this.emit('simulationComplete', {
                type: 'privilege-escalation',
                attackerId,
                target,
                eventsGenerated,
                real: true
            });
            return { success: true, attackerId, eventsGenerated, real: true };
        }
        catch (error) {
            logger_1.logger.error('Real privilege escalation simulation failed:', error);
            return this.simulatePrivilegeEscalationMock(target, method);
        }
    }
    /**
     * Mock privilege escalation simulation
     */
    async simulatePrivilegeEscalationMock(target, method) {
        logger_1.logger.warn(`Using MOCK privilege escalation simulation for ${target}`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        const attacker = new models_1.Attacker({
            attackerId,
            ipAddress: attackerIp,
            entryPoint: target,
            currentPrivilege: 'User',
            riskLevel: 'High',
            campaign: 'Simulated Attack',
            firstSeen: new Date(),
            lastSeen: new Date(),
            dwellTime: 0,
            status: 'Active'
        });
        await attacker.save();
        const classification = await this.mitreService.classifyEvent(method);
        const event = new models_1.AttackEvent({
            eventId: `evt-${(0, uuid_1.v4)()}`,
            attackerId,
            type: 'Privilege Escalation',
            tactic: classification?.tactic || 'privilege-escalation',
            tacticId: classification?.tacticId || 'TA0004',
            technique: classification?.techniqueId || 'T1068',
            techniqueName: classification?.techniqueName || 'Exploitation for Privilege Escalation',
            mitreConfidence: classification?.confidence || 0.7,
            classificationMethod: classification?.method || 'pattern',
            description: `Privilege escalation (MOCK): ${method}`,
            sourceHost: target,
            targetHost: target,
            severity: 'High',
            status: 'Detected'
        });
        await event.save();
        attacker.currentPrivilege = 'Admin';
        attacker.riskLevel = 'Critical';
        await attacker.save();
        return { success: true, attackerId, real: false };
    }
    /**
     * Simulate REAL full attack campaign with MITRE classification
     */
    async simulateFullCampaign(params) {
        const { complexity = 'advanced' } = params;
        // Check if we have enough VMs running
        const requiredVMs = ['fake-web-01', 'fake-jump-01', 'fake-ftp-01'];
        const availableVMs = requiredVMs.filter(vm => this.vmCache.has(vm));
        if (availableVMs.length < 2) {
            logger_1.logger.warn('Not enough VMs running for full campaign, using mock data');
            return this.simulateFullCampaignMock(complexity);
        }
        logger_1.logger.info(`🎯 Starting REAL full attack campaign simulation (complexity: ${complexity})`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        let eventsGenerated = 0;
        try {
            const attacker = new models_1.Attacker({
                attackerId,
                ipAddress: attackerIp,
                entryPoint: 'fake-web-01',
                currentPrivilege: 'User',
                riskLevel: 'Medium',
                campaign: 'Shadow Hydra',
                firstSeen: new Date(),
                lastSeen: new Date(),
                dwellTime: 0,
                status: 'Active'
            });
            await attacker.save();
            this.emit('attackerUpdated', attacker);
            // Stage 1: Initial Access (fake-web-01)
            await this.executeOnVM('fake-web-01', `/usr/local/bin/syslogd-helper observe "Exploited public-facing application (fake-web-01)"`);
            const initialClassification = await this.mitreService.classifyEvent('web application exploit');
            const initialEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Initial Access',
                tactic: initialClassification?.tactic || 'initial-access',
                tacticId: initialClassification?.tacticId || 'TA0001',
                technique: initialClassification?.techniqueId || 'T1190',
                techniqueName: initialClassification?.techniqueName || 'Exploit Public-Facing Application',
                description: 'Exploited public-facing application (fake-web-01)',
                sourceHost: attackerIp,
                targetHost: 'fake-web-01',
                severity: 'High',
                status: 'Detected'
            });
            await initialEvent.save();
            this.emit('newEvent', initialEvent);
            eventsGenerated++;
            await new Promise(resolve => setTimeout(resolve, 1500));
            // Stage 2: Discovery
            const discoveryCmds = ['whoami', 'uname -a', 'cat /etc/passwd'];
            for (const cmd of discoveryCmds) {
                await this.executeOnVM('fake-web-01', cmd);
                const classification = await this.mitreService.classifyEvent(cmd);
                const event = new models_1.AttackEvent({
                    eventId: `evt-${(0, uuid_1.v4)()}`,
                    attackerId,
                    type: 'Discovery',
                    tactic: classification?.tactic || 'discovery',
                    tacticId: classification?.tacticId || 'TA0007',
                    technique: classification?.techniqueId || 'T1083',
                    techniqueName: classification?.techniqueName || 'System Information Discovery',
                    description: `System reconnaissance: ${cmd}`,
                    sourceHost: 'fake-web-01',
                    targetHost: 'fake-web-01',
                    severity: 'Low',
                    status: 'Detected',
                    command: cmd
                });
                await event.save();
                this.emit('newEvent', event);
                eventsGenerated++;
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            // Stage 3: Credential Theft
            await this.executeOnVM('fake-web-01', `/usr/local/bin/syslogd-helper observe "Found database credentials in web application config"`);
            const credClassification = await this.mitreService.classifyEvent('credential theft from config');
            const credEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Credential Theft',
                tactic: credClassification?.tactic || 'credential-access',
                tacticId: credClassification?.tacticId || 'TA0006',
                technique: credClassification?.techniqueId || 'T1003',
                techniqueName: credClassification?.techniqueName || 'OS Credential Dumping',
                description: 'Found database credentials in web application config',
                sourceHost: 'fake-web-01',
                targetHost: 'fake-web-01',
                severity: 'High',
                status: 'Detected'
            });
            await credEvent.save();
            this.emit('newEvent', credEvent);
            eventsGenerated++;
            await models_1.Credential.create({
                credentialId: `cred-${(0, uuid_1.v4)()}`,
                username: 'dbadmin',
                password: 'DbP@ss2024!',
                source: 'fake-web-01',
                attackerId,
                decoyHost: 'fake-web-01',
                status: 'Stolen',
                riskScore: 85
            });
            await new Promise(resolve => setTimeout(resolve, 1500));
            // Stage 4: Lateral Movement
            const pivotTargets = ['fake-jump-01', 'fake-ftp-01'].filter(t => this.vmCache.has(t));
            let currentHost = 'fake-web-01';
            for (const target of pivotTargets) {
                try {
                    await this.executeOnVM(currentHost, `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 vagrant@${this.vmCache.get(target).ip} "whoami" 2>&1 || true`);
                }
                catch (e) {
                    // Connection attempt
                }
                await this.executeOnVM(currentHost, `/usr/local/bin/syslogd-helper observe "Pivoted to ${target} using stolen SSH credentials"`);
                await this.executeOnVM(target, `/usr/local/bin/syslogd-helper visit "${attackerIp}" "${target}"`);
                const moveClassification = await this.mitreService.classifyEvent('lateral movement ssh pivot');
                const moveEvent = new models_1.AttackEvent({
                    eventId: `evt-${(0, uuid_1.v4)()}`,
                    attackerId,
                    type: 'Lateral Movement',
                    tactic: moveClassification?.tactic || 'lateral-movement',
                    tacticId: moveClassification?.tacticId || 'TA0008',
                    technique: moveClassification?.techniqueId || 'T1021',
                    techniqueName: moveClassification?.techniqueName || 'Remote Services',
                    description: `Pivoted to ${target} using stolen SSH credentials`,
                    sourceHost: currentHost,
                    targetHost: target,
                    severity: 'High',
                    status: 'Detected'
                });
                await moveEvent.save();
                this.emit('newEvent', moveEvent);
                eventsGenerated++;
                await models_1.LateralMovement.create({
                    movementId: `mov-${(0, uuid_1.v4)()}`,
                    attackerId,
                    sourceHost: currentHost,
                    targetHost: target,
                    technique: moveEvent.technique,
                    method: 'SSH',
                    successful: true
                });
                currentHost = target;
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
            // Stage 5: Privilege Escalation
            await this.executeOnVM(currentHost, `/usr/local/bin/syslogd-helper observe "Exploited local privilege escalation vulnerability"`);
            const privClassification = await this.mitreService.classifyEvent('privilege escalation exploit');
            const privEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Privilege Escalation',
                tactic: privClassification?.tactic || 'privilege-escalation',
                tacticId: privClassification?.tacticId || 'TA0004',
                technique: privClassification?.techniqueId || 'T1068',
                techniqueName: privClassification?.techniqueName || 'Exploitation for Privilege Escalation',
                description: 'Exploited local privilege escalation vulnerability',
                sourceHost: currentHost,
                targetHost: currentHost,
                severity: 'Critical',
                status: 'Detected'
            });
            await privEvent.save();
            this.emit('newEvent', privEvent);
            eventsGenerated++;
            attacker.currentPrivilege = 'Admin';
            attacker.riskLevel = 'Critical';
            await attacker.save();
            await new Promise(resolve => setTimeout(resolve, 1500));
            // Stage 6: Data Exfiltration
            await this.executeOnVM(currentHost, `/usr/local/bin/syslogd-helper observe "Large data transfer detected to external IP"`);
            const exfilClassification = await this.mitreService.classifyEvent('data exfiltration');
            const exfilEvent = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: 'Data Exfiltration',
                tactic: exfilClassification?.tactic || 'exfiltration',
                tacticId: exfilClassification?.tacticId || 'TA0010',
                technique: exfilClassification?.techniqueId || 'T1041',
                techniqueName: exfilClassification?.techniqueName || 'Exfiltration Over C2 Channel',
                description: 'Large data transfer detected to external IP',
                sourceHost: currentHost,
                targetHost: attackerIp,
                severity: 'Critical',
                status: 'Detected'
            });
            await exfilEvent.save();
            this.emit('newEvent', exfilEvent);
            eventsGenerated++;
            for (const vm of ['fake-web-01', ...pivotTargets]) {
                await this.executeOnVM(vm, '/usr/local/bin/syslogd-helper sync >/dev/null 2>&1 &');
            }
            this.emit('simulationComplete', {
                type: 'full-campaign',
                attackerId,
                campaign: 'Shadow Hydra',
                eventsGenerated,
                stagesCompleted: 6,
                real: true
            });
            return { success: true, attackerId, campaign: 'Shadow Hydra', stagesCompleted: 6, real: true };
        }
        catch (error) {
            logger_1.logger.error('Real full campaign simulation failed:', error);
            return this.simulateFullCampaignMock(complexity);
        }
    }
    /**
     * Mock full campaign simulation
     */
    async simulateFullCampaignMock(complexity) {
        logger_1.logger.warn(`Using MOCK full campaign simulation (complexity: ${complexity})`);
        const attackerIp = `10.20.20.${Math.floor(Math.random() * 100) + 100}`;
        const attackerId = `APT-${attackerIp.replace(/\./g, '-')}`;
        const attacker = new models_1.Attacker({
            attackerId,
            ipAddress: attackerIp,
            entryPoint: 'fake-web-01',
            currentPrivilege: 'User',
            riskLevel: 'Medium',
            campaign: 'Shadow Hydra',
            firstSeen: new Date(),
            lastSeen: new Date(),
            dwellTime: 0,
            status: 'Active'
        });
        await attacker.save();
        // Create mock events for each stage
        const stages = [
            { type: 'Initial Access', technique: 'T1190', description: 'Exploited public-facing application' },
            { type: 'Discovery', technique: 'T1083', description: 'System reconnaissance' },
            { type: 'Credential Theft', technique: 'T1003', description: 'Found credentials in config' },
            { type: 'Lateral Movement', technique: 'T1021', description: 'Pivoted to internal hosts' },
            { type: 'Privilege Escalation', technique: 'T1068', description: 'Escalated to admin' },
            { type: 'Data Exfiltration', technique: 'T1041', description: 'Data transfer detected' }
        ];
        for (const stage of stages) {
            const classification = await this.mitreService.classifyEvent(stage.description);
            const event = new models_1.AttackEvent({
                eventId: `evt-${(0, uuid_1.v4)()}`,
                attackerId,
                type: stage.type,
                tactic: classification?.tactic || 'unknown',
                tacticId: classification?.tacticId || 'TA0000',
                technique: classification?.techniqueId || stage.technique,
                techniqueName: classification?.techniqueName || stage.description,
                mitreConfidence: classification?.confidence || 0.7,
                classificationMethod: classification?.method || 'pattern',
                description: stage.description,
                sourceHost: attackerIp,
                targetHost: 'fake-web-01',
                severity: 'High',
                status: 'Detected'
            });
            await event.save();
        }
        return { success: true, attackerId, campaign: 'Shadow Hydra', stagesCompleted: 6, real: false };
    }
    /**
     * Refresh VM cache - force rediscovery of running VMs
     */
    async refreshVMs() {
        logger_1.logger.info('Starting VM cache refresh...');
        this.vmCache.clear();
        await this.discoverVMs();
        const result = { count: this.vmCache.size, vms: Array.from(this.vmCache.keys()) };
        logger_1.logger.info(`VM cache refresh complete: ${result.count} VMs found: [${result.vms.join(', ')}]`);
        return result;
    }
    /**
     * Manual VM cache population for debugging/testing
     * Use this if automatic discovery is not working
     */
    async populateVMCacheManually(vmConfigs) {
        this.vmCache.clear();
        for (const config of vmConfigs) {
            this.vmCache.set(config.name, { path: config.path, ip: config.ip });
            logger_1.logger.info(`Manually added VM to cache: ${config.name} (${config.ip})`);
        }
        logger_1.logger.info(`Manual VM cache populated with ${this.vmCache.size} VMs`);
        return { count: this.vmCache.size, vms: Array.from(this.vmCache.keys()) };
    }
    /**
     * Get current VM cache status
     */
    getVMCacheStatus() {
        return {
            count: this.vmCache.size,
            vms: Array.from(this.vmCache.entries()).map(([name, info]) => ({
                name,
                ip: info.ip,
                path: info.path
            }))
        };
    }
}
exports.RealSimulationService = RealSimulationService;
//# sourceMappingURL=RealSimulationService.js.map