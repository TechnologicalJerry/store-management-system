import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import Session from "@/models/Session";
import { verifyToken } from "@/lib/jwt";
import { successResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const token = request.cookies.get("token");
    const sessionId = request.cookies.get("sessionId");

    // Update session if session ID exists
    if (sessionId) {
      try {
        const session = await Session.findById(sessionId);
        if (session && session.status === "active") {
          session.logoutTime = new Date();
          session.status = "logged_out";
          await session.save();
        }
      } catch (error) {
        // If session not found, continue with logout
        console.error("Error updating session:", error);
      }
    }

    // Also update any active sessions for this user if token is valid
    if (token) {
      try {
        const payload = verifyToken(token.value);
        await Session.updateMany(
          {
            userId: payload.userId,
            status: "active",
          },
          {
            $set: {
              logoutTime: new Date(),
              status: "logged_out",
            },
          }
        );
      } catch (error) {
        // Token might be invalid, continue with logout
        console.error("Error updating user sessions:", error);
      }
    }

    // Create response
    const response = successResponse(null, "Logged out successfully", 200);

    // Clear cookies
    response.cookies.delete("token");
    response.cookies.delete("refreshToken");
    response.cookies.delete("sessionId");

    return response;
  } catch (error) {
    return handleError(error);
  }
}
