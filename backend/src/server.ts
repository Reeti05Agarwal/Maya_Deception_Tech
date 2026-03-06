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
import { SimulationService } from './services/SimulationService';
import { InfrastructureDiscoveryService } from './services/InfrastructureDiscoveryService';
import dashboardRoutes from './routes/dashboard';
import simulationRoutes from './routes/simulation';
import decoyRoutes from './routes/decoy';

dotenv.config();

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/maya_deception';

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
const simulationService = new SimulationService();
const infrastructureDiscovery = new InfrastructureDiscoveryService();
const wsHandler = new WebSocketHandler(server, crdtSync, simulationService);

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/decoy', decoyRoutes);

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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Maya Deception Fabric Dashboard API',
    version: '1.0.0',
    endpoints: {
      dashboard: '/api/dashboard',
      decoy: '/api/decoy',
      health: '/health',
      websocket: 'ws://localhost:' + PORT + '/ws'
    }
  });
});

app.get('/api/vms', async (req, res) => {
  try {
    const discovered = await infrastructureDiscovery.discoverVMs();

    res.json({
      vms: discovered,
      updatedAt: new Date().toISOString(),
      cached: false
    });
  } catch (error) {
    logger.error('Failed to discover VM status:', error);
    res.status(500).json({
      vms: [],
      updatedAt: new Date().toISOString(),
      cached: false,
      error: 'Infrastructure discovery error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    crdtSync.stopSyncLoop();
    server.close(() => {
      mongoose.connection.close()
        .then(() => {
          logger.info('Server closed');
          process.exit(0);
        })
        .catch((err) => {
          logger.error('Error closing MongoDB connection:', err);
          process.exit(1);
        });
    });
  });
  
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    crdtSync.stopSyncLoop();
    server.close(() => {
      mongoose.connection.close()
        .then(() => {
          logger.info('Server closed');
          process.exit(0);
        })
        .catch((err) => {
          logger.error('Error closing MongoDB connection:', err);
          process.exit(1);
        });
    });
  });
