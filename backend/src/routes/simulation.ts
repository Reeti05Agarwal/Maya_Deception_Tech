import { Router, Request, Response } from 'express';
import { RealSimulationService } from '../services/RealSimulationService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const simulationService = new RealSimulationService();

// SSH Brute Force Simulation
router.post('/ssh-bruteforce', asyncHandler(async (req: Request, res: Response) => {
  const { target = 'fake-jump-01', attempts = 5 } = req.body;
  
  logger.info(`API: REAL SSH brute force simulation requested - target: ${target}, attempts: ${attempts}`);
  
  const result = await simulationService.simulateSSHBruteForce({ target, attempts });
  
  res.json({
    success: true,
    message: result.real ? 'REAL SSH brute force simulation executed on VM' : 'Mock simulation (VM not available)',
    data: result,
    real: result.real || false,
    timestamp: new Date().toISOString()
  });
}));

// Lateral Movement Simulation
router.post('/lateral-movement', asyncHandler(async (req: Request, res: Response) => {
  const { source = 'fake-web-01', targets = ['fake-jump-01', 'fake-ftp-01'] } = req.body;
  
  logger.info(`API: REAL lateral movement simulation requested - source: ${source}, targets: [${targets.join(', ')}]`);
  
  const result = await simulationService.simulateLateralMovement({ source, targets });
  
  res.json({
    success: result.success,
    message: result.real ? 'REAL lateral movement simulation executed on VMs' : 'Mock simulation (VMs not available)',
    data: result,
    real: result.real || false,
    timestamp: new Date().toISOString()
  });
}));

// Credential Theft Simulation
router.post('/credential-theft', asyncHandler(async (req: Request, res: Response) => {
  const { target = 'fake-web-01', tool = 'mimikatz' } = req.body;
  
  logger.info(`API: REAL credential theft simulation requested - target: ${target}, tool: ${tool}`);
  
  const result = await simulationService.simulateCredentialTheft({ target, tool });
  
  res.json({
    success: result.success,
    message: result.real ? 'REAL credential theft simulation executed on VM' : 'Mock simulation (VM not available)',
    data: result,
    real: result.real || false,
    timestamp: new Date().toISOString()
  });
}));

// Refresh VMs endpoint
router.post('/refresh-vms', asyncHandler(async (req: Request, res: Response) => {
  logger.info('API: Refreshing VM cache');
  
  const result = await simulationService.refreshVMs();
  
  res.json({
    success: true,
    message: `Discovered ${result.count} running VMs`,
    data: result,
    timestamp: new Date().toISOString()
  });
}));

// Get simulation status
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      availableSimulations: [
        'ssh-bruteforce',
        'lateral-movement',
        'credential-theft'
      ],
      runningVMs: Array.from((simulationService as any).vmCache?.keys() || []),
      status: 'ready',
      mode: 'real-attacks',
      timestamp: new Date().toISOString()
    }
  });
}));

export default router;
