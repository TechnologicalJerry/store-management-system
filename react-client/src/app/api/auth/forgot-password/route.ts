import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import { forgotPassword } from "@/services/auth.service";
import { forgotPasswordSchema } from "@/lib/validators/auth.schema";
import { successResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse request body
    const body = await request.json();

    // Validate input
    const validatedData = forgotPasswordSchema.parse(body);

    // Send password reset email
    await forgotPassword(validatedData.email);

    // Always return success message (don't reveal if email exists)
    return successResponse(
      null,
      "If an account with that email exists, we've sent a password reset link.",
      200
    );
  } catch (error) {
    return handleError(error);
  }
}
