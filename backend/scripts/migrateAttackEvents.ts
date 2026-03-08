// scripts/migrateAttackEvents.ts
import mongoose from 'mongoose';
import AttackEvent from '../src/models/AttackEvent';
import { MitreAttackService } from '../src/services/MitreAttackService';

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI!);
  
  const events = await AttackEvent.find({
    $or: [
      { mitreConfidence: { $exists: false } },
      { techniqueName: { $exists: false } }
    ]
  });
  
  console.log(`Migrating ${events.length} events...`);
  
  const mitreService = new MitreAttackService();
  
  for (const event of events) {
    const classified = await mitreService.classifyEvent(event.command || event.description);
    
    if (classified) {
      event.tactic = classified.tactic;
      event.tacticId = classified.tacticId;
      event.techniqueName = classified.techniqueName;
      event.isSubtechnique = classified.isSubtechnique;
      event.mitreConfidence = classified.confidence;
      event.classificationMethod = classified.method as any;
      event.allMatchingTechniques = classified.allMatches;
      await event.save();
    }
  }
  
  console.log('Migration complete');
  await mongoose.disconnect();
}

migrate().catch(console.error);