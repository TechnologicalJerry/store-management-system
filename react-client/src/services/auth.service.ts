// Authentication service
import User, { IUser } from "@/models/User";
import { generateToken, generateRefreshToken } from "@/lib/jwt";
import { AppError } from "@/lib/error-handler";
import crypto from "crypto";

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    userName: string;
    firstName: string;
    lastName: string;
    fullName: string;
    role: string;
  };
  token: string;
  refreshToken: string;
}

export async function loginUser(
  emailOrUsername: string,
  password: string
): Promise<AuthResponse> {
  // Determine if input is email or username
  const isEmail = /\S+@\S+\.\S+/.test(emailOrUsername);
  
  // Find user by email or username and include password
  const user = await User.findOne(
    isEmail 
      ? { email: emailOrUsername.toLowerCase() }
      : { userName: emailOrUsername }
  ).select("+password");

  if (!user) {
    throw new AppError("Invalid email/username or password", 401);
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new AppError("Invalid email/username or password", 401);
  }

  // Generate tokens
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

  return {
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
}

export async function signupUser(userData: {
  email: string;
  password: string;
  userName: string;
  firstName: string;
  lastName: string;
  gender: string;
  dob: string;
  phone: string;
  role: string;
}): Promise<AuthResponse> {
  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email: userData.email }, { userName: userData.userName }],
  });

  if (existingUser) {
    if (existingUser.email === userData.email) {
      throw new AppError("Email already exists", 409);
    }
    if (existingUser.userName === userData.userName) {
      throw new AppError("Username already exists", 409);
    }
  }

  // Create new user
  const user = new User({
    email: userData.email,
    password: userData.password,
    userName: userData.userName,
    firstName: userData.firstName,
    lastName: userData.lastName,
    gender: userData.gender,
    dob: new Date(userData.dob),
    phone: userData.phone,
    role: userData.role,
  });

  await user.save();

  // Generate tokens
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

  return {
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
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal if email exists or not for security
    return;
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set reset token and expiration (1 hour)
  user.resetPasswordToken = resetTokenHash;
  user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
  await user.save({ validateBeforeSave: false });

  // In a real application, you would send an email here
  // For now, we'll just log it (you can implement email service later)
  const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password/${resetToken}`;
  
  console.log("Password reset URL:", resetUrl);
  console.log("Reset token:", resetToken);
  
  // TODO: Implement email service
  // await sendPasswordResetEmail(user.email, resetUrl);
}
