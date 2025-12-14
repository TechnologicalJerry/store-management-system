import { NextRequest } from "next/server";
import connectDB from "@/db/connection";
import { signupUser } from "@/services/auth.service";
import { signupSchema } from "@/lib/validators/auth.schema";
import { successResponse } from "@/lib/api-response";
import { handleError } from "@/lib/error-handler";

export async function POST(request: NextRequest) {
  try {
    // Connect to database
    await connectDB();

    // Parse request body
    const body = await request.json();

    // Validate input
    const validatedData = signupSchema.parse(body);

    // Create user
    const result = await signupUser({
      email: validatedData.email,
      password: validatedData.password,
      userName: validatedData.userName,
      firstName: validatedData.firstName,
      lastName: validatedData.lastName,
      gender: validatedData.gender,
      dob: validatedData.dob,
      phone: validatedData.phone,
      role: validatedData.role,
    });

    // Create response
    const response = successResponse(result, "Account created successfully", 201);

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

    return response;
  } catch (error) {
    return handleError(error);
  }
}
