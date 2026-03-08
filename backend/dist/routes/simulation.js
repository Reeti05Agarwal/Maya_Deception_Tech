"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const RealSimulationService_1 = require("../services/RealSimulationService");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
const simulationService = new RealSimulationService_1.RealSimulationService();
// Valid VM name pattern (security: prevent path traversal)
const VM_NAME_PATTERN = /^fake-[a-z0-9-]+$/i;
const VALID_SCAN_TYPES = ['internal', 'external', 'full', 'stealth'];
const VALID_TOOLS = ['mimikatz', 'lazagne', 'gsecdump', 'pwdump'];
const VALID_METHODS = ['sudo-exploit', 'kernel-exploit', 'misconfiguration', 'credential-reuse'];
/**
 * Validate VM name to prevent path traversal and injection attacks
 */
function isValidVmName(name) {
    return VM_NAME_PATTERN.test(name);
}
/**
 * Validate and sanitize simulation parameters
 */
function validateSimulationInput(params, type) {
    if (params.target && !isValidVmName(params.target)) {
        return {
            valid: false,
            error: `Invalid target VM name: ${params.target}. Must match pattern: ${VM_NAME_PATTERN}`
        };
    }
    if (params.source && !isValidVmName(params.source)) {
        return {
            valid: false,
            error: `Invalid source VM name: ${params.source}. Must match pattern: ${VM_NAME_PATTERN}`
        };
    }
    if (params.targets && Array.isArray(params.targets)) {
        for (const target of params.targets) {
            if (!isValidVmName(target)) {
                return {
                    valid: false,
                    error: `Invalid target VM name in array: ${target}`
                };
            }
        }
    }
    return { valid: true };
}
// Helper: Refresh VM cache before simulations if needed
async function ensureVMCacheFresh() {
    logger_1.logger.info('Refreshing VM cache before simulation...');
    const vmStatus = await simulationService.refreshVMs();
    logger_1.logger.info(`VM cache refreshed: ${vmStatus.count} running VMs found: [${vmStatus.vms.join(', ')}]`);
    return vmStatus;
}
// SSH Brute Force Simulation
router.post('/ssh-bruteforce', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { target = 'fake-jump-01', attempts = 5 } = req.body;
    // Validate inputs
    const validation = validateSimulationInput({ target }, 'ssh-bruteforce');
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            error: validation.error,
            timestamp: new Date().toISOString()
        });
    }
    // Validate attempts range
    const safeAttempts = Math.min(Math.max(1, parseInt(attempts) || 5), 100);
    if (safeAttempts !== attempts) {
        logger_1.logger.warn(`Adjusted attempts from ${attempts} to ${safeAttempts}`);
    }
    logger_1.logger.info(`API: REAL SSH brute force simulation requested - target: ${target}, attempts: ${safeAttempts}`);
    // Refresh VM cache before simulation
    await ensureVMCacheFresh();
    const result = await simulationService.simulateSSHBruteForce({ target, attempts: safeAttempts });
    res.json({
        success: true,
        message: result.real ? 'REAL SSH brute force simulation executed on VM' : 'Mock simulation (VM not available)',
        data: result,
        real: result.real || false,
        attackerId: result.attackerId,
        timestamp: new Date().toISOString()
    });
}));
// Lateral Movement Simulation
router.post('/lateral-movement', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { source = 'fake-web-01', targets = ['fake-jump-01', 'fake-ftp-01'] } = req.body;
    // Validate inputs
    const validation = validateSimulationInput({ source, targets }, 'lateral-movement');
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            error: validation.error,
            timestamp: new Date().toISOString()
        });
    }
    // Ensure targets is an array with at least one element
    const safeTargets = Array.isArray(targets) && targets.length > 0 ? targets : ['fake-jump-01'];
    logger_1.logger.info(`API: REAL lateral movement simulation requested - source: ${source}, targets: [${safeTargets.join(', ')}]`);
    // Refresh VM cache before simulation
    await ensureVMCacheFresh();
    const result = await simulationService.simulateLateralMovement({ source, targets: safeTargets });
    res.json({
        success: result.success,
        message: result.real ? 'REAL lateral movement simulation executed on VMs' : 'Mock simulation (VMs not available)',
        data: result,
        real: result.real || false,
        attackerId: result.attackerId,
        timestamp: new Date().toISOString()
    });
}));
// Credential Theft Simulation
router.post('/credential-theft', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { target = 'fake-web-01', tool = 'mimikatz' } = req.body;
    // Validate inputs
    const validation = validateSimulationInput({ target }, 'credential-theft');
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            error: validation.error,
            timestamp: new Date().toISOString()
        });
    }
    // Validate tool parameter
    const safeTool = VALID_TOOLS.includes(tool?.toLowerCase()) ? tool.toLowerCase() : 'mimikatz';
    if (safeTool !== tool?.toLowerCase()) {
        logger_1.logger.warn(`Adjusted tool from ${tool} to ${safeTool}`);
    }
    logger_1.logger.info(`API: REAL credential theft simulation requested - target: ${target}, tool: ${safeTool}`);
    // Refresh VM cache before simulation
    await ensureVMCacheFresh();
    const result = await simulationService.simulateCredentialTheft({ target, tool: safeTool });
    res.json({
        success: result.success,
        message: result.real ? 'REAL credential theft simulation executed on VM' : 'Mock simulation (VM not available)',
        data: result,
        real: result.real || false,
        attackerId: result.attackerId,
        timestamp: new Date().toISOString()
    });
}));
// Network Discovery Simulation
router.post('/discovery', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { source = 'fake-jump-01', scanType = 'internal' } = req.body;
    // Validate inputs
    const validation = validateSimulationInput({ source }, 'discovery');
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            error: validation.error,
            timestamp: new Date().toISOString()
        });
    }
    // Validate scan type
    const safeScanType = VALID_SCAN_TYPES.includes(scanType?.toLowerCase()) ? scanType.toLowerCase() : 'internal';
    if (safeScanType !== scanType?.toLowerCase()) {
        logger_1.logger.warn(`Adjusted scanType from ${scanType} to ${safeScanType}`);
    }
    logger_1.logger.info(`API: REAL network discovery simulation requested - source: ${source}, scanType: ${safeScanType}`);
    // Refresh VM cache before simulation
    await ensureVMCacheFresh();
    const result = await simulationService.simulateDiscovery({ source, scanType: safeScanType });
    res.json({
        success: true,
        message: result.real ? 'REAL network discovery simulation executed on VM' : 'Mock simulation (VM not available)',
        data: result,
        real: result.real || false,
        attackerId: result.attackerId,
        timestamp: new Date().toISOString()
    });
}));
// Privilege Escalation Simulation
router.post('/privilege-escalation', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { target = 'fake-ftp-01', method = 'sudo-exploit' } = req.body;
    // Validate inputs
    const validation = validateSimulationInput({ target }, 'privilege-escalation');
    if (!validation.valid) {
        return res.status(400).json({
            success: false,
            error: validation.error,
            timestamp: new Date().toISOString()
        });
    }
    // Validate method parameter
    const safeMethod = VALID_METHODS.includes(method?.toLowerCase()) ? method.toLowerCase() : 'sudo-exploit';
    if (safeMethod !== method?.toLowerCase()) {
        logger_1.logger.warn(`Adjusted method from ${method} to ${safeMethod}`);
    }
    logger_1.logger.info(`API: REAL privilege escalation simulation requested - target: ${target}, method: ${safeMethod}`);
    // Refresh VM cache before simulation
    await ensureVMCacheFresh();
    const result = await simulationService.simulatePrivilegeEscalation({ target, method: safeMethod });
    res.json({
        success: true,
        message: result.real ? 'REAL privilege escalation simulation executed on VM' : 'Mock simulation (VM not available)',
        data: result,
        real: result.real || false,
        attackerId: result.attackerId,
        timestamp: new Date().toISOString()
    });
}));
// Full Attack Campaign Simulation
router.post('/full-campaign', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { complexity = 'advanced' } = req.body;
    // Validate complexity parameter
    const validComplexities = ['basic', 'intermediate', 'advanced', 'apt'];
    const safeComplexity = validComplexities.includes(complexity?.toLowerCase()) ? complexity.toLowerCase() : 'advanced';
    if (safeComplexity !== complexity?.toLowerCase()) {
        logger_1.logger.warn(`Adjusted complexity from ${complexity} to ${safeComplexity}`);
    }
    logger_1.logger.info(`API: REAL full attack campaign simulation requested - complexity: ${safeComplexity}`);
    // Refresh VM cache before simulation
    await ensureVMCacheFresh();
    const result = await simulationService.simulateFullCampaign({ complexity: safeComplexity });
    res.json({
        success: true,
        message: result.real ? 'REAL full attack campaign simulation executed' : 'Mock simulation (VMs not available)',
        data: result,
        real: result.real || false,
        attackerId: result.attackerId,
        timestamp: new Date().toISOString()
    });
}));
// Refresh VMs endpoint
router.post('/refresh-vms', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    logger_1.logger.info('API: Refreshing VM cache');
    const result = await simulationService.refreshVMs();
    res.json({
        success: true,
        message: `Discovered ${result.count} running VMs`,
        data: result,
        timestamp: new Date().toISOString()
    });
}));
// Get simulation status
router.get('/status', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const vmCacheStatus = simulationService.getVMCacheStatus();
    res.json({
        success: true,
        data: {
            availableSimulations: [
                'ssh-bruteforce',
                'lateral-movement',
                'credential-theft',
                'discovery',
                'privilege-escalation',
                'full-campaign'
            ],
            vmCache: vmCacheStatus,
            runningVMs: Array.from(simulationService.vmCache?.keys() || []),
            status: 'ready',
            mode: 'real-attacks',
            validationRules: {
                vmNamePattern: VM_NAME_PATTERN.toString(),
                validScanTypes: VALID_SCAN_TYPES,
                validTools: VALID_TOOLS,
                validMethods: VALID_METHODS
            },
            timestamp: new Date().toISOString()
        }
    });
}));
// Get detailed VM cache status
router.get('/vm-cache', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const vmCacheStatus = simulationService.getVMCacheStatus();
    res.json({
        success: true,
        data: vmCacheStatus,
        timestamp: new Date().toISOString()
    });
}));
// Manually populate VM cache (for debugging)
router.post('/vm-cache/populate', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const { vms } = req.body; // Array of { name, path, ip }
    if (!Array.isArray(vms)) {
        return res.status(400).json({
            success: false,
            error: 'vms array is required',
            timestamp: new Date().toISOString()
        });
    }
    const result = await simulationService.populateVMCacheManually(vms);
    res.json({
        success: true,
        message: `Manually populated ${result.count} VMs`,
        data: result,
        timestamp: new Date().toISOString()
    });
}));
// Force refresh VM cache
router.post('/vm-cache/refresh', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    logger_1.logger.info('Force refreshing VM cache...');
    const result = await simulationService.refreshVMs();
    res.json({
        success: true,
        message: `Refreshed VM cache: ${result.count} VMs found`,
        data: result,
        timestamp: new Date().toISOString()
    });
}));
exports.default = router;
//# sourceMappingURL=simulation.js.map