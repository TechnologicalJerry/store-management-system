import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import User from "@/models/User";
import { verifyToken } from "@/lib/jwt";
import { successResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";
import { z } from "zod";

const updateProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required").min(2, "First name must be at least 2 characters").optional(),
  lastName: z.string().min(1, "Last name is required").min(2, "Last name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email format").optional(),
  userName: z.string().min(3, "Username must be at least 3 characters").regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores").optional(),
  gender: z.enum(["male", "female", "other", "prefer-not-to-say"]).optional(),
  dob: z.string().optional(),
  phone: z.string().regex(/^[\d\s\-\+\(\)]+$/, "Invalid phone number format").optional(),
});

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const token = request.cookies.get("token");

    if (!token) {
      return successResponse(null, "Not authenticated", 401);
    }

    try {
      const payload = verifyToken(token.value);
      const user = await User.findById(payload.userId).select("-password");

      if (!user) {
        return successResponse(null, "User not found", 404);
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
          createdAt: user.createdAt,
        },
        "Profile retrieved successfully",
        200
      );
    } catch (error) {
      return successResponse(null, "Invalid token", 401);
    }
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const token = request.cookies.get("token");

    if (!token) {
      return successResponse(null, "Not authenticated", 401);
    }

    try {
      const payload = verifyToken(token.value);
      const body = await request.json();
      const validatedData = updateProfileSchema.parse(body);

      const user = await User.findById(payload.userId);

      if (!user) {
        return successResponse(null, "User not found", 404);
      }

      // Check if email or username is being changed and if it's already taken
      if (validatedData.email && validatedData.email !== user.email) {
        const emailExists = await User.findOne({ email: validatedData.email });
        if (emailExists) {
          return successResponse(null, "Email already exists", 409);
        }
      }

      if (validatedData.userName && validatedData.userName !== user.userName) {
        const userNameExists = await User.findOne({ userName: validatedData.userName });
        if (userNameExists) {
          return successResponse(null, "Username already exists", 409);
        }
      }

      // Update user fields
      if (validatedData.firstName) user.firstName = validatedData.firstName;
      if (validatedData.lastName) user.lastName = validatedData.lastName;
      if (validatedData.email) user.email = validatedData.email.toLowerCase();
      if (validatedData.userName) user.userName = validatedData.userName;
      if (validatedData.gender) user.gender = validatedData.gender;
      if (validatedData.dob) user.dob = new Date(validatedData.dob);
      if (validatedData.phone) user.phone = validatedData.phone;

      await user.save();

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
        },
        "Profile updated successfully",
        200
      );
    } catch (error) {
      return handleError(error);
    }
  } catch (error) {
    return handleError(error);
  }
}

