
/// <reference types="node" />
// // One-time setup script

// src/scripts/initialSync.ts
import { MitreSyncService } from '../src/services/MitreSyncService';
import mongoose from 'mongoose';

async function initialSetup() {
  console.log('🚀 Starting initial MITRE ATT&CK setup...');
  
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/maya_deception');
  
  const syncService = new MitreSyncService();
  
  // Check if already populated
  const health = await syncService.healthCheck();
  if (health.healthy) {
    console.log(`✅ Already populated with ${health.techniqueCount} techniques`);
    console.log(`📅 Last sync: ${health.lastSync}`);
    await mongoose.disconnect();
    return;
  }
  
  console.log('⬇️  Downloading MITRE ATT&CK data...');
  const result = await syncService.sync();
  
  console.log('✅ Setup complete!');
  console.log(`📊 Loaded ${result.techniquesCount} techniques from ${result.source}`);
  
  await mongoose.disconnect();
}

initialSetup().catch(console.error);