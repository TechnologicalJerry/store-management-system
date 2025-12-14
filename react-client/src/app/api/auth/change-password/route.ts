import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import User from "@/models/User";
import { verifyToken } from "@/lib/jwt";
import { successResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const token = request.cookies.get("token");

    if (!token) {
      return successResponse(null, "Not authenticated", 401);
    }

    try {
      const payload = verifyToken(token.value);
      const body = await request.json();
      const validatedData = changePasswordSchema.parse(body);

      const user = await User.findById(payload.userId).select("+password");

      if (!user) {
        return successResponse(null, "User not found", 404);
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(validatedData.currentPassword);

      if (!isCurrentPasswordValid) {
        return successResponse(null, "Current password is incorrect", 400);
      }

      // Update password
      user.password = validatedData.newPassword;
      await user.save();

      return successResponse(null, "Password changed successfully", 200);
    } catch (error) {
      return handleError(error);
    }
  } catch (error) {
    return handleError(error);
  }
}

