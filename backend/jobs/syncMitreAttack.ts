// Cron job entry point

// src/jobs/syncMitreAttack.ts
import { MitreSyncService } from '../src/services/MitreSyncService';
import mongoose from 'mongoose';

async function runSync() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/maya_deception');
    
    const syncService = new MitreSyncService();
    const result = await syncService.sync();
    
    console.log('[Cron] MITRE sync completed:', result);
    
    // Health check
    const health = await syncService.healthCheck();
    console.log('[Cron] Health check:', health);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('[Cron] Sync failed:', error);
    process.exit(1);
  }
}

runSync();