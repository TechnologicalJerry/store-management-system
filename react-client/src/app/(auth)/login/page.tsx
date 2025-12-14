"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import Link from "next/link";

function LoginFormWrapper() {
  return <LoginForm />;
}

function AuthCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);

  // useEffect(() => {
  //   const checkAuth = async () => {
  //     try {
  //       const response = await fetch("/api/auth/me", {
  //         credentials: "include", // Include cookies in the request
  //       });
  //       const data = await response.json();

  //       if (data.success && data.data) {
  //         // User is authenticated, redirect to dashboard
  //         router.push("/dashboard");
  //         // router.refresh();
  //       } else {
  //         // User is not authenticated, show login form
  //         setIsChecking(false);
  //       }
  //     } catch (error) {
  //       // Error checking auth, show login form
  //       setIsChecking(false);
  //     }
  //   };

  //   checkAuth();
  // }, [router]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function LoginPage() {
  return (
    <AuthCheck>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Sign in to your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Or{" "}
              <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-700">
                create a new account
              </Link>
            </p>
          </div>
          <div className="bg-white py-8 px-6 shadow-lg rounded-lg">
            <Suspense fallback={<div className="text-center py-4">Loading...</div>}>
              <LoginFormWrapper />
            </Suspense>
          </div>
        </div>
      </div>
    </AuthCheck>
  );
}

