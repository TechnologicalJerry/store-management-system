// Error handling utilities
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import mongoose from "mongoose";

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export function handleError(error: unknown): NextResponse {
  console.error("Error:", error);

  // Zod validation errors
  if (error instanceof ZodError) {
    const errors = error.errors.map((err) => ({
      field: err.path.join("."),
      message: err.message,
    }));
    return NextResponse.json(
      {
        success: false,
        message: "Validation error",
        errors,
      },
      { status: 400 }
    );
  }

  // Mongoose duplicate key error
  if (error instanceof Error && error.name === "MongoServerError") {
    const mongoError = error as any;
    if (mongoError.code === 11000) {
      const field = Object.keys(mongoError.keyPattern)[0];
      return NextResponse.json(
        {
          success: false,
          message: `${field} already exists`,
          error: error.message,
        },
        { status: 409 }
      );
    }
  }

  // Mongoose validation error
  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(error.errors).map((err) => ({
      field: err.path,
      message: err.message,
    }));
    return NextResponse.json(
      {
        success: false,
        message: "Validation error",
        errors,
      },
      { status: 400 }
    );
  }

  // Custom AppError
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
        error: error.message,
      },
      { status: error.statusCode }
    );
  }

  // Generic error
  return NextResponse.json(
    {
      success: false,
      message: "An error occurred",
      error: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 }
  );
}
