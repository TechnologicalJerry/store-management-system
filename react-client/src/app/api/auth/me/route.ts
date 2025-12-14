import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/db/connection";
import User from "@/models/User";
import { verifyToken } from "@/lib/jwt";
import { successResponse, errorResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";

export async function GET(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Get token from cookies
    const token = request.cookies.get("token");
    
    // Debug: Log all cookies
    const allCookies = request.cookies.getAll();
    console.log("[API /auth/me] All cookies:", allCookies.map(c => c.name));
    console.log("[API /auth/me] Token cookie:", token ? "exists" : "missing");

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          message: "Not authenticated",
        },
        { status: 401 }
      );
    }

    try {
      // Verify token
      const payload = verifyToken(token.value);

      // Get user from database
      const user = await User.findById(payload.userId).select("-password");

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "User not found",
          },
          { status: 404 }
        );
      }

      return successResponse(
        {
          id: user._id.toString(),
          email: user.email,
          userName: user.userName,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          gender: user.gender,
          dob: user.dob ? user.dob.toISOString().split("T")[0] : null,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        },
        "User retrieved successfully",
        200
      );
    } catch (tokenError) {
      console.log("Token verification failed:", tokenError);
      return NextResponse.json(
        {
          success: false,
          message: "Invalid token",
        },
        { status: 401 }
      );
    }
  } catch (error) {
    return handleError(error);
  }
}
