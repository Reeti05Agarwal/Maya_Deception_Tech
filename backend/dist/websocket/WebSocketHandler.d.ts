import { Server } from 'http';
import { CRDTSyncService } from '../services/CRDTSyncService';
import { SimulationService } from '../services/SimulationService';
export declare class WebSocketHandler {
    private wss;
    private crdtSync;
    private simulationService;
    private dashboardService;
    private clients;
    constructor(server: Server, crdtSync: CRDTSyncService, simulationService: SimulationService);
    private setupWebSocket;
    private setupEventListeners;
    private handleMessage;
    private getActiveAttackers;
    private broadcast;
    getClientCount(): number;
}
