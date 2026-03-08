import mongoose, { Schema, Document } from 'mongoose';
import type { CompanyBlueprint, DecoyGenerationInput } from '../services/DecoyGenerationService';

export interface ICompanyBlueprint extends Document {
  blueprintId: string;
  createdAt: Date;
  config: DecoyGenerationInput;
  blueprint: CompanyBlueprint;
  deployment?: {
    status: 'pending' | 'applying' | 'applied' | 'failed';
    vmName?: string;
    templateVmName?: string;
    errorMessage?: string;
    createdAt?: Date;
    updatedAt?: Date;
    result?: unknown;
  };
}

const EmployeeSchema = new Schema(
  {
    name: { type: String, required: true },
    role: { type: String, required: true },
    department: { type: String, required: true },
    username: { type: String, required: true }
  },
  { _id: false }
);

const InternalServerSchema = new Schema(
  {
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['web', 'auth', 'db', 'payments', 'api', 'worker', 'cache', 'ehr', 'backup', 'fileserver', 'jump'],
      required: true
    }
  },
  { _id: false }
);

const DocumentSchema = new Schema(
  {
    filename: { type: String, required: true },
    content: { type: String, required: true }
  },
  { _id: false }
);

const CompanyBlueprintDataSchema = new Schema(
  {
    companyName: { type: String, required: true },
    industry: { type: String, required: true },
    profile: { type: String, enum: ['fintech', 'healthcare', 'saas', 'enterprise'], required: true },
    employees: { type: [EmployeeSchema], default: [] },
    services: { type: [String], default: [] },
    techStack: { type: [String], default: [] },
    internalServers: { type: [InternalServerSchema], default: [] },
    documents: { type: [DocumentSchema], default: [] }
  },
  { _id: false }
);

const CompanyBlueprintSchema = new Schema<ICompanyBlueprint>(
  {
    blueprintId: { type: String, required: true, unique: true, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
    config: {
      industry: { type: String, required: true },
      companySize: { type: Number, required: true },
      region: { type: String, required: true }
    },
    blueprint: { type: CompanyBlueprintDataSchema, required: true },
    deployment: {
      status: {
        type: String,
        enum: ['pending', 'applying', 'applied', 'failed'],
        default: 'pending'
      },
      vmName: { type: String },
      templateVmName: { type: String },
      errorMessage: { type: String },
      createdAt: { type: Date },
      updatedAt: { type: Date },
      result: { type: Schema.Types.Mixed }
    }
  },
  {
    timestamps: false
  }
);

export default mongoose.model<ICompanyBlueprint>('CompanyBlueprint', CompanyBlueprintSchema);
