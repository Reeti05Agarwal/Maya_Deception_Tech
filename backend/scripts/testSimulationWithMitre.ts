// scripts/testSimulationWithMitre.ts
import { RealSimulationService } from '../src/services/RealSimulationService';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/maya_deception');
  
  console.log('🎯 Testing RealSimulationService with MITRE classification...\n');
  
  const simulationService = new RealSimulationService();
  
  // Wait for VM discovery
  console.log('⏳ Discovering VMs...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check available VMs
  const vmStatus = await simulationService.refreshVMs();
  console.log('Available VMs:', vmStatus);
  
  if (vmStatus.count === 0) {
    console.log('❌ No VMs running. Start your Vagrant VMs first:');
    console.log('   cd simulations/fake-web && vagrant up');
    process.exit(1);
  }
  
  const targetVM = vmStatus.vms[0];
  console.log(`\n🎲 Simulating attacks on ${targetVM}...\n`);
  
  // Test 1: SSH Brute Force
  console.log('--- Test 1: SSH Brute Force ---');
  const bruteResult = await simulationService.simulateSSHBruteForce({
    target: targetVM,
    attempts: 3
  });
  console.log('Result:', bruteResult);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Credential Theft (if VM supports it)
  console.log('\n--- Test 2: Credential Theft ---');
  const credResult = await simulationService.simulateCredentialTheft({
    target: targetVM,
    tool: 'mimikatz'
  });
  console.log('Result:', credResult);
  
  // Check what was saved to database
  console.log('\n--- Verifying Database Records ---');
  const { AttackEvent } = require('../src/models');
  const events = await AttackEvent.find().sort({ timestamp: -1 }).limit(5).lean();
  
  console.log('\nLatest 5 events with MITRE classification:');
  events.forEach((e: any, i: number) => {
    console.log(`\n${i + 1}. ${e.technique} - ${e.techniqueName}`);
    console.log(`   Tactic: ${e.tacticName} (${e.tacticId})`);
    console.log(`   Confidence: ${(e.mitreConfidence * 100).toFixed(1)}%`);
    console.log(`   Method: ${e.classificationMethod}`);
    console.log(`   Command: ${e.command || e.description.substring(0, 50)}...`);
  });
  
  await mongoose.disconnect();
  console.log('\n✅ Test complete!');
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});