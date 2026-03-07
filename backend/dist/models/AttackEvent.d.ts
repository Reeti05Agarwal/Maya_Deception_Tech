import mongoose, { Document } from 'mongoose';
export interface IAttackEvent extends Document {
    eventId: string;
    timestamp: Date;
    attackerId: string;
    type: 'Initial Access' | 'Credential Theft' | 'Lateral Movement' | 'Command Execution' | 'Data Exfiltration' | 'Privilege Escalation' | 'Discovery' | 'Persistence' | 'Defense Evasion';
    description: string;
    sourceHost: string;
    targetHost: string;
    command?: string;
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
    status: 'Detected' | 'In Progress' | 'Blocked' | 'Contained';
    tactic: string;
    tacticId: string;
    tacticName?: string;
    technique: string;
    techniqueName: string;
    techniqueDescription?: string;
    isSubtechnique: boolean;
    subtechniqueOf?: string;
    mitreConfidence: number;
    classificationMethod: 'exact' | 'fuzzy' | 'pattern' | 'manual' | 'unknown';
    allMatchingTechniques: string[];
    commandPatternMatched?: string;
    navigatorScore?: number;
    metadata?: {
        processName?: string;
        pid?: number;
        filePath?: string;
        hash?: string;
        parentProcess?: string;
        userContext?: string;
    };
    createdAt?: Date;
    updatedAt?: Date;
}
declare const _default: mongoose.Model<IAttackEvent, {}, {}, {}, mongoose.Document<unknown, {}, IAttackEvent, {}, {}> & IAttackEvent & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default _default;
