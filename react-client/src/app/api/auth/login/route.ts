import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import { loginUser } from "@/services/auth.service";
import { loginSchema } from "@/lib/validators/auth.schema";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";
import Session from "@/models/Session";
import mongoose from "mongoose";

export async function POST(request: NextRequest) {
  try {
    console.log("[API /auth/login] Login request received");
    
    // Connect to database
    await connectDB();

    // Parse request body
    const body = await request.json();
    console.log("[API /auth/login] Request body:", { emailOrUsername: body.emailOrUsername });

    // Validate input
    const validatedData = loginSchema.parse(body);

    // Login user
    const result = await loginUser(validatedData.emailOrUsername, validatedData.password);

    // Get IP address and user agent
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    // x-forwarded-for can contain multiple IPs separated by commas, take the first one
    const ipAddress = forwardedFor 
      ? forwardedFor.split(",")[0].trim()
      : realIp || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Create response first
    const response = successResponse(result, "Login successful", 200);

    // Set HTTP-only cookies for tokens
    response.cookies.set("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    response.cookies.set("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    console.log("Login successful for user:", result.user.email);
    console.log("Cookies set - token length:", result.token.length);
    console.log("IP Address:", ipAddress);
    console.log("[API /auth/login] Setting cookies in response");
    console.log("[API /auth/login] Token starts with:", result.token.substring(0, 20));

    // Create session record (convert userId string to ObjectId)
    // Don't fail login if session creation fails
    try {
      const session = new Session({
        userId: new mongoose.Types.ObjectId(result.user.id),
        email: result.user.email,
        userName: result.user.userName,
        role: result.user.role,
        loginTime: new Date(),
        status: "active",
        ipAddress: ipAddress,
        userAgent: userAgent,
      });

      const savedSession = await session.save();
      
      // Store session ID in cookie (for logout tracking)
      response.cookies.set("sessionId", savedSession._id.toString(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: "/",
      });
    } catch (sessionError) {
      // Log session error but don't fail login
      console.error("Failed to create session:", sessionError);
      // Continue with login even if session creation fails
    }

    return response;
  } catch (error) {
    return handleError(error);
  }
}
