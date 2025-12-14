import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import User from "@/models/User";
import { generateToken, generateRefreshToken } from "@/lib/jwt";
import { successResponse } from "@/lib/api-response";
import { handleError, AppError } from "@/lib/error-handler";
import { z } from "zod";
import crypto from "crypto";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse request body
    const body = await request.json();

    // Validate input
    const validatedData = resetPasswordSchema.parse(body);

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto
      .createHash("sha256")
      .update(validatedData.token)
      .digest("hex");

    // Find user with valid reset token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+password +resetPasswordToken +resetPasswordExpires");

    if (!user) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    // Update password and clear reset token
    user.password = validatedData.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Generate new tokens
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    const result = {
      user: {
        id: user._id.toString(),
        email: user.email,
        userName: user.userName,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        role: user.role,
      },
      token,
      refreshToken,
    };

    // Create response
    const response = successResponse(result, "Password reset successful", 200);

    // Set HTTP-only cookies for tokens
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    return handleError(error);
  }
}
