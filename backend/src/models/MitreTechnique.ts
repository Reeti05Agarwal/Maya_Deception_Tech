// MongoDB schema for cached techniques

// src/models/MitreTechnique.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IMitreTechnique extends Document {
  techniqueId: string;           // T1003.001
  name: string;                  // OS Credential Dumping: LSASS Memory
  tactic: string;                // credential-access
  tacticName: string;            // Credential Access (display name)
  description: string;
  platforms: string[];
  dataSources: string[];
  isSubtechnique: boolean;
  subtechniqueOf?: string;       // T1003 (parent)
  detection: string;
  permissionsRequired: string[];
  effectivePermissions: string[];
  impactType?: string;
  contributors: string[];
  created: Date;
  modified: Date;
  version: string;
  // Internal tracking
  lastSynced: Date;
  source: 'github' | 'taxii';
  commandPatterns: string[];     // Auto-extracted command signatures
}

const MitreTechniqueSchema = new Schema<IMitreTechnique>({
  techniqueId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  tactic: { type: String, required: true, index: true },
  tacticName: { type: String, required: true },
  description: { type: String, required: true },
  platforms: [{ type: String }],
  dataSources: [{ type: String }],
  isSubtechnique: { type: Boolean, default: false },
  subtechniqueOf: { type: String, index: true },
  detection: { type: String },
  permissionsRequired: [{ type: String }],
  effectivePermissions: [{ type: String }],
  impactType: { type: String },
  contributors: [{ type: String }],
  created: { type: Date },
  modified: { type: Date },
  version: { type: String },
  lastSynced: { type: Date, default: Date.now },
  source: { type: String, enum: ['github', 'taxii'], default: 'github' },
  commandPatterns: [{ type: String, index: true }]
}, {
  timestamps: true
});

// Compound indexes for common queries
MitreTechniqueSchema.index({ tactic: 1, isSubtechnique: 1 });
MitreTechniqueSchema.index({ platforms: 1 });
MitreTechniqueSchema.index({ commandPatterns: 'text', name: 'text', description: 'text' });

export const MitreTechnique = mongoose.model<IMitreTechnique>('MitreTechnique', MitreTechniqueSchema);