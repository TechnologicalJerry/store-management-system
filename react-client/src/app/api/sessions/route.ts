import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import Session from "@/models/Session";
import { verifyToken } from "@/lib/jwt";
import { successResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const token = request.cookies.get("token");

    if (!token) {
      return successResponse(null, "Not authenticated", 401);
    }

    try {
      const payload = verifyToken(token.value);

      // Only admin and supervisor can view all sessions
      if (payload.role !== "admin" && payload.role !== "supervisor") {
        return successResponse(null, "Access denied", 403);
      }

      const { searchParams } = new URL(request.url);
      const userId = searchParams.get("userId");
      const status = searchParams.get("status");
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "50");
      const skip = (page - 1) * limit;

      // Build query
      const query: any = {};
      if (userId) {
        query.userId = userId;
      }
      if (status) {
        query.status = status;
      }

      // Get sessions with pagination
      const sessions = await Session.find(query)
        .sort({ loginTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Get total count
      const total = await Session.countDocuments(query);

      // Format sessions
      const formattedSessions = sessions.map((session) => ({
        id: session._id.toString(),
        userId: session.userId.toString(),
        email: session.email,
        userName: session.userName,
        role: session.role,
        loginTime: session.loginTime,
        logoutTime: session.logoutTime || null,
        status: session.status,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        duration: session.logoutTime
          ? Math.round((session.logoutTime.getTime() - session.loginTime.getTime()) / 1000 / 60) // minutes
          : null,
      }));

      return successResponse(
        {
          sessions: formattedSessions,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
        "Sessions retrieved successfully",
        200
      );
    } catch (error) {
      return successResponse(null, "Invalid token", 401);
    }
  } catch (error) {
    return handleError(error);
  }
}

