// scripts/testClassification.ts
import { MitreAttackService } from '../src/services/MitreAttackService';
import mongoose from 'mongoose';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/maya_deception');
  
  const service = new MitreAttackService();
  
  // Test command classification
  const testCommands = [
    'mimikatz.exe sekurlsa::logonpasswords',
    'powershell -enc ZWxldmF0ZQ==',
    'net user hacker P@ssw0rd /add',
    'schtasks /create /tn "Update" /tr "malware.exe"',
    'whoami /priv',
    'rundll32.exe evil.dll,EntryPoint'
  ];
  
  for (const cmd of testCommands) {
    const result = await service.classifyEvent(cmd);
    console.log(`\n📝 Command: ${cmd}`);
    if (result) {
      console.log(`   Technique: ${result.techniqueId} - ${result.techniqueName}`);
      console.log(`   Tactic: ${result.tactic} (${result.tacticId})`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Method: ${result.method}`);
    } else {
      console.log('   ❌ No classification');
    }
  }
  
  // Get stats
  const stats = await service.getStats();
  console.log('\n📊 MITRE Cache Stats:', stats);
  
  await mongoose.disconnect();
}

test();