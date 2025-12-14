"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    emailOrUsername: "",
    password: "",
  });
  const [errors, setErrors] = useState<{ emailOrUsername?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    setError("");
  };

  const validate = () => {
    const newErrors: { emailOrUsername?: string; password?: string } = {};
    
    if (!formData.emailOrUsername.trim()) {
      newErrors.emailOrUsername = "Email or username is required";
    }
    
    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    console.log("[LoginForm] Submit button clicked");
    
    if (!validate()) {
      console.log("[LoginForm] Validation failed");
      return;
    }

    setIsLoading(true);
    console.log("[LoginForm] Sending login request");
    try {
      // Only send emailOrUsername and password, exclude any other fields
      const payload = {
        emailOrUsername: formData.emailOrUsername.trim(),
        password: formData.password,
      };
      
      console.log("[LoginForm] Payload:", { emailOrUsername: payload.emailOrUsername });
      
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include", // Ensure cookies are sent and received
      });

      console.log("[LoginForm] Response status:", response.status);
      const data = await response.json();
      console.log("[LoginForm] Response data:", { success: data.success, message: data.message });

      // Check response status and data
      if (!response.ok || !data.success) {
        // Handle validation errors
        if (data.errors && Array.isArray(data.errors)) {
          const fieldErrors: { emailOrUsername?: string; password?: string } = {};
          data.errors.forEach((err: { field: string; message: string }) => {
            if (err.field === "emailOrUsername" || err.field === "email") {
              fieldErrors.emailOrUsername = err.message;
            } else if (err.field === "password") {
              fieldErrors.password = err.message;
            }
          });
          setErrors(fieldErrors);
          throw new Error(data.message || "Please fix the errors above");
        }
        throw new Error(data.message || data.error || "Login failed");
      }

      console.log("Login successful, redirecting...");

      // Check if there's a redirect parameter in the URL
      const redirectTo = searchParams.get("redirect") || "/dashboard";
      
      // Small delay to ensure cookies are properly set
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // // Use window.location for a full page reload
      // // This ensures cookies are properly set and middleware runs
      console.log("[LoginForm] Redirecting to:", redirectTo);
      window.location.href = redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during login");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="emailOrUsername" className="block text-sm font-medium text-gray-700 mb-2">
          Email or Username
        </label>
        <input
          type="text"
          id="emailOrUsername"
          name="emailOrUsername"
          value={formData.emailOrUsername}
          onChange={handleChange}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
            errors.emailOrUsername ? "border-red-300" : "border-gray-300"
          }`}
          placeholder="Enter your email or username"
          disabled={isLoading}
        />
        {errors.emailOrUsername && (
          <p className="mt-1 text-sm text-red-600">{errors.emailOrUsername}</p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
          Password
        </label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            className={`w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition ${
              errors.password ? "border-red-300" : "border-gray-300"
            }`}
            placeholder="Enter your password"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
            tabIndex={-1}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L12 12m-5.71-5.71L12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1 text-sm text-red-600">{errors.password}</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            id="remember-me"
            name="remember-me"
            type="checkbox"
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
            Remember me
          </label>
        </div>

        <Link
          href="/forgot-password"
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Forgot password?
        </Link>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? "Signing in..." : "Sign In"}
      </button>

      <div className="text-center">
        <p className="text-sm text-gray-600">
          Don't have an account?{" "}
          <Link href="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </form>
  );
}

