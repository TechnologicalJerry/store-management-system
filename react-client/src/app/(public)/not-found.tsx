"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  const handleGoBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-4xl">
        {/* Main 404 Content */}
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8 mb-16">
          <h1 className="text-8xl md:text-9xl font-light text-white leading-none">404</h1>
          <div className="hidden md:block w-px h-20 bg-white"></div>
          <p className="text-white text-lg md:text-xl font-light max-w-md">
            This page could not be found.
          </p>
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
          <button
            onClick={handleGoBack}
            className="text-white border border-white px-6 py-3 font-light hover:bg-white hover:text-black transition-all duration-200"
          >
            ← Go Back
          </button>
          <Link
            href="/"
            className="text-white border border-white px-6 py-3 font-light hover:bg-white hover:text-black transition-all duration-200 text-center"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

