import mongoose, { Schema, Document } from 'mongoose';

export interface IAttackEvent extends Document {
  // Core identification
  eventId: string;
  timestamp: Date;
  attackerId: string;
  
  // Event categorization (legacy fields - keep for backward compatibility)
  type: 'Initial Access' | 'Credential Theft' | 'Lateral Movement' | 'Command Execution' | 
        'Data Exfiltration' | 'Privilege Escalation' | 'Discovery' | 'Persistence' | 'Defense Evasion';
  description: string;
  sourceHost: string;
  targetHost: string;
  command?: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Detected' | 'In Progress' | 'Blocked' | 'Contained';
  
  // MITRE ATT&CK fields (properly populated from cached data)
  tactic: string;                    // credential-access (shortname)
  tacticId: string;                  // TA0006
  tacticName?: string;               // Credential Access (display name)
  technique: string;                 // T1003.001
  techniqueName: string;             // OS Credential Dumping: LSASS Memory
  techniqueDescription?: string;      // Full description from MITRE
  isSubtechnique: boolean;           // true for T1003.001, false for T1003
  subtechniqueOf?: string;           // T1003 (parent technique ID)
  
  // Classification metadata
  mitreConfidence: number;           // 0.0 - 1.0 classification confidence
  classificationMethod: 'exact' | 'fuzzy' | 'pattern' | 'manual' | 'unknown';
  allMatchingTechniques: string[];   // Alternative technique IDs that matched
  commandPatternMatched?: string;    // Which specific pattern triggered the match
  
  // For ATT&CK Navigator export scoring
  navigatorScore?: number;           // Calculated score for heatmap generation
  
  // Optional technical metadata
  metadata?: {
    processName?: string;
    pid?: number;
    filePath?: string;
    hash?: string;
    parentProcess?: string;
    userContext?: string;
  };
  
  // System fields
  createdAt?: Date;
  updatedAt?: Date;
}

const AttackEventSchema: Schema = new Schema({
  // Core identification
  eventId: { type: String, required: true, unique: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  attackerId: { type: String, required: true, ref: 'Attacker', index: true },
  
  // Event categorization (legacy - maintain backward compatibility)
  type: { 
    type: String, 
    enum: ['Initial Access', 'Credential Theft', 'Lateral Movement', 'Command Execution', 
           'Data Exfiltration', 'Privilege Escalation', 'Discovery', 'Persistence', 'Defense Evasion'],
    required: true 
  },
  description: { type: String, required: true },
  sourceHost: { type: String, required: true },
  targetHost: { type: String, required: true },
  command: { type: String, index: true },  // Indexed for pattern matching queries
  severity: { 
    type: String, 
    enum: ['Low', 'Medium', 'High', 'Critical'], 
    required: true,
    index: true 
  },
  status: { 
    type: String, 
    enum: ['Detected', 'In Progress', 'Blocked', 'Contained'], 
    default: 'Detected',
    index: true 
  },
  
  // MITRE ATT&CK fields (new - populated from cached MITRE data)
  tactic: { 
    type: String, 
    required: true, 
    index: true  // credential-access, initial-access, etc.
  },
  tacticId: { 
    type: String, 
    required: true, 
    index: true  // TA0006, TA0001, etc.
  },
  tacticName: { 
    type: String  // "Credential Access", "Initial Access" (human readable)
  },
  technique: { 
    type: String, 
    required: true, 
    index: true  // T1003.001, T1059.001, etc.
  },
  techniqueName: { 
    type: String, 
    required: true  // "OS Credential Dumping: LSASS Memory"
  },
  techniqueDescription: { 
    type: String  // Full MITRE description
  },
  isSubtechnique: { 
    type: Boolean, 
    default: false,
    index: true 
  },
  subtechniqueOf: { 
    type: String,  // Parent technique ID (e.g., T1003 for T1003.001)
    index: true 
  },
  
  // Classification metadata (new - tracking how we classified this event)
  mitreConfidence: { 
    type: Number, 
    min: 0, 
    max: 1, 
    default: 0,
    index: true  // Query by confidence level
  },
  classificationMethod: { 
    type: String, 
    enum: ['exact', 'fuzzy', 'pattern', 'manual', 'unknown'], 
    default: 'unknown',
    index: true 
  },
  allMatchingTechniques: [{ 
    type: String  // Array of T-IDs that also matched (for ambiguity tracking)
  }],
  commandPatternMatched: { 
    type: String,  // The specific signature that triggered (e.g., "mimikatz")
    index: true 
  },
  
  // Navigator scoring (new - for ATT&CK Navigator export)
  navigatorScore: { 
    type: Number,
    min: 0,
    max: 100
  },
  
  // Optional technical metadata (expanded)
  metadata: {
    processName: String,
    pid: Number,
    filePath: String,
    hash: String,
    parentProcess: String,      // New: parent process name
    userContext: String         // New: user running the command
  }
}, { 
  timestamps: true  // Adds createdAt and updatedAt automatically
});

// Compound indexes for common query patterns
AttackEventSchema.index({ timestamp: -1, attackerId: 1 });           // Time-based attacker queries
AttackEventSchema.index({ attackerId: 1, tactic: 1 });              // Attacker tactic breakdown
AttackEventSchema.index({ attackerId: 1, technique: 1 });            // Attacker technique breakdown
AttackEventSchema.index({ technique: 1, timestamp: -1 });               // Global technique trends
AttackEventSchema.index({ tacticId: 1, technique: 1 });               // Matrix generation
AttackEventSchema.index({ mitreConfidence: -1, timestamp: -1 });      // High-confidence recent events
AttackEventSchema.index({ commandPatternMatched: 1, timestamp: -1 }); // Pattern effectiveness

// Text index for searching descriptions and commands
AttackEventSchema.index({ 
  description: 'text', 
  command: 'text',
  techniqueName: 'text' 
});

export default mongoose.model<IAttackEvent>('AttackEvent', AttackEventSchema);