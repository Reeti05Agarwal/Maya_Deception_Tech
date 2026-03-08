// src/models/MitreTactic.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IMitreTactic extends Document {
  tacticId: string;      // TA0006
  name: string;          // Credential Access
  shortname: string;     // credential-access
  description: string;
  url: string;
  order: number;         // Display order in matrix
}

const MitreTacticSchema = new Schema<IMitreTactic>({
  tacticId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  shortname: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  url: { type: String },
  order: { type: Number, default: 0 }
});

export const MitreTactic = mongoose.model<IMitreTactic>('MitreTactic', MitreTacticSchema);