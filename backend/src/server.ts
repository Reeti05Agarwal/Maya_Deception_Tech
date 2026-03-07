import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { createServer } from 'http';

import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { CRDTSyncService } from './services/CRDTSyncService';
import { WebSocketHandler } from './websocket/WebSocketHandler';
import { RealSimulationService } from './services/RealSimulationService';
import dashboardRoutes from './routes/dashboard';
import simulationRoutes from './routes/simulation';
import VMStatus from './models/VMStatus'; 
import cron from 'node-cron';
import { MitreSyncService } from './services/MitreSyncService';

dotenv.config();

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/maya_deception';

cron.schedule('0 3 * * *', async () => {
  console.log('[Scheduler] Starting daily MITRE sync...');
  const syncService = new MitreSyncService();
  await syncService.sync();
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing and logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(compression());

// MongoDB Connection
mongoose.connect(MONGODB_URI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Initialize services
const crdtSync = new CRDTSyncService();
const simulationService = new RealSimulationService();
const wsHandler = new WebSocketHandler(server, crdtSync, simulationService);

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/simulation', simulationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    websocketClients: wsHandler.getClientCount(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// VM Status endpoint with proper error handling
app.get('/api/vms', async (req, res) => {
  try {
    logger.info('Fetching VM status from database...');
    
    const vms = await VMStatus.find().sort({ vmName: 1 }).lean();
    
    logger.info(`Found ${vms.length} VMs in database`);

    if (!vms || vms.length === 0) {
      logger.warn('No VMs found in database');
    }

    // Transform to expected format
    const formattedVMs = vms.map(vm => ({
      name: vm.vmName,
      status: vm.status,
      ip: vm.ip,
      lastSeen: vm.lastSeen,
      crdtState: vm.crdtState,
      dockerContainers: vm.dockerContainers || []
    }));

    res.json({
      vms: formattedVMs,
      updatedAt: new Date().toISOString(),
      cached: false
    });

  } catch (error) {
    logger.error('Failed to fetch VM status from DB:', error);
    res.status(500).json({
      vms: [],
      updatedAt: new Date().toISOString(),
      cached: false,
      error: 'Database error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Attacker summary endpoint (for dashboard)
app.get('/api/attackers/summary', async (req, res) => {
  try {
    const { Attacker } = require('../src/models');
    const attackers = await Attacker.find().sort({ lastSeen: -1 }).limit(100).lean();
    
    const summary = {
      total: attackers.length,
      critical: attackers.filter((a: any) => a.riskLevel === 'Critical').length,
      high: attackers.filter((a: any) => a.riskLevel === 'High').length,
      medium: attackers.filter((a: any) => a.riskLevel === 'Medium').length,
      low: attackers.filter((a: any) => a.riskLevel === 'Low').length,
      attackers: attackers.map((a: any) => ({
        id: a.attackerId,
        ip: a.ipAddress,
        riskLevel: a.riskLevel,
        firstSeen: a.firstSeen,
        lastSeen: a.lastSeen,
        dwellTime: a.dwellTime,
        status: a.status
      }))
    };
    
    res.json(summary);
  } catch (error) {
    logger.error('Failed to fetch attacker summary:', error);
    res.status(500).json({ error: 'Failed to fetch attacker data' });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Maya Deception Fabric Dashboard API',
    version: '1.0.0',
    endpoints: {
      dashboard: '/api/dashboard',
      vms: '/api/vms',
      attackers: '/api/attackers/summary',
      health: '/health',
      websocket: 'ws://localhost:' + PORT + '/ws'
    }
  });
});

// Error handling
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Maya Dashboard API running on http://localhost:${PORT}`);
  logger.info(`📊 WebSocket endpoint: ws://localhost:${PORT}/ws`);
  
  // Start CRDT sync loop
  const syncInterval = parseInt(process.env.CRDT_SYNC_INTERVAL || '10000');
  crdtSync.startSyncLoop(syncInterval);
});

// Graceful shutdown with timeout
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  
  // Stop accepting new requests
  server.close(async () => {
    logger.info('HTTP server closed');
    
    // Stop sync loops
    crdtSync.stopSyncLoop();
    
    // Close MongoDB connection with timeout
    try {
      await Promise.race([
        mongoose.connection.close(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('MongoDB close timeout')), 5000)
        )
      ]);
      logger.info('MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      logger.error('Error closing MongoDB connection:', err);
      process.exit(1);
    }
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully exiting');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));