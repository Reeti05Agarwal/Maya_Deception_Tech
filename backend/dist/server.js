"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const http_1 = require("http");
const errorHandler_1 = require("./middleware/errorHandler");
const logger_1 = require("./utils/logger");
const CRDTSyncService_1 = require("./services/CRDTSyncService");
const WebSocketHandler_1 = require("./websocket/WebSocketHandler");
const RealSimulationService_1 = require("./services/RealSimulationService");
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const simulation_1 = __importDefault(require("./routes/simulation"));
const VMStatus_1 = __importDefault(require("./models/VMStatus"));
const node_cron_1 = __importDefault(require("node-cron"));
const MitreSyncService_1 = require("./services/MitreSyncService");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/maya_deception';
node_cron_1.default.schedule('0 3 * * *', async () => {
    console.log('[Scheduler] Starting daily MITRE sync...');
    const syncService = new MitreSyncService_1.MitreSyncService();
    await syncService.sync();
});
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
// Body parsing and logging
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, morgan_1.default)('combined', { stream: { write: msg => logger_1.logger.info(msg.trim()) } }));
app.use((0, compression_1.default)());
// MongoDB Connection
mongoose_1.default.connect(MONGODB_URI)
    .then(() => logger_1.logger.info('Connected to MongoDB'))
    .catch(err => {
    logger_1.logger.error('MongoDB connection error:', err);
    process.exit(1);
});
// Initialize services
const crdtSync = new CRDTSyncService_1.CRDTSyncService();
const simulationService = new RealSimulationService_1.RealSimulationService();
const wsHandler = new WebSocketHandler_1.WebSocketHandler(server, crdtSync, simulationService);
// API Routes
app.use('/api/dashboard', dashboard_1.default);
app.use('/api/simulation', simulation_1.default);
// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        websocketClients: wsHandler.getClientCount(),
        mongodb: mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});
// VM Status endpoint with proper error handling
app.get('/api/vms', async (req, res) => {
    try {
        logger_1.logger.info('Fetching VM status from database...');
        const vms = await VMStatus_1.default.find().sort({ vmName: 1 }).lean();
        logger_1.logger.info(`Found ${vms.length} VMs in database`);
        if (!vms || vms.length === 0) {
            logger_1.logger.warn('No VMs found in database');
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
    }
    catch (error) {
        logger_1.logger.error('Failed to fetch VM status from DB:', error);
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
            critical: attackers.filter((a) => a.riskLevel === 'Critical').length,
            high: attackers.filter((a) => a.riskLevel === 'High').length,
            medium: attackers.filter((a) => a.riskLevel === 'Medium').length,
            low: attackers.filter((a) => a.riskLevel === 'Low').length,
            attackers: attackers.map((a) => ({
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
    }
    catch (error) {
        logger_1.logger.error('Failed to fetch attacker summary:', error);
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
app.use(errorHandler_1.errorHandler);
// Start server
server.listen(PORT, () => {
    logger_1.logger.info(`🚀 Maya Dashboard API running on http://localhost:${PORT}`);
    logger_1.logger.info(`📊 WebSocket endpoint: ws://localhost:${PORT}/ws`);
    // Start CRDT sync loop
    const syncInterval = parseInt(process.env.CRDT_SYNC_INTERVAL || '10000');
    crdtSync.startSyncLoop(syncInterval);
});
// Graceful shutdown with timeout
const gracefulShutdown = async (signal) => {
    logger_1.logger.info(`${signal} received, shutting down gracefully`);
    // Stop accepting new requests
    server.close(async () => {
        logger_1.logger.info('HTTP server closed');
        // Stop sync loops
        crdtSync.stopSyncLoop();
        // Close MongoDB connection with timeout
        try {
            await Promise.race([
                mongoose_1.default.connection.close(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB close timeout')), 5000))
            ]);
            logger_1.logger.info('MongoDB connection closed');
            process.exit(0);
        }
        catch (err) {
            logger_1.logger.error('Error closing MongoDB connection:', err);
            process.exit(1);
        }
    });
    // Force exit after 10 seconds
    setTimeout(() => {
        logger_1.logger.error('Could not close connections in time, forcefully exiting');
        process.exit(1);
    }, 10000);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
//# sourceMappingURL=server.js.map