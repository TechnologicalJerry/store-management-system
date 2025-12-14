// MongoDB Mongoose Session Model
import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  email: string;
  userName: string;
  role: string;
  loginTime: Date;
  logoutTime?: Date;
  status: "active" | "logged_out";
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
    },
    userName: {
      type: String,
      required: [true, "Username is required"],
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: ["admin", "supervisor", "user"],
    },
    loginTime: {
      type: Date,
      required: [true, "Login time is required"],
      default: Date.now,
      index: true,
    },
    logoutTime: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "logged_out"],
      default: "active",
      index: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
SessionSchema.index({ userId: 1, status: 1 });
SessionSchema.index({ loginTime: -1 });
SessionSchema.index({ status: 1, loginTime: -1 });

// Prevent re-compilation during development
const Session: Model<ISession> =
  mongoose.models.Session || mongoose.model<ISession>("Session", SessionSchema);

export default Session;

