import Link from "next/link";

export default function PublicHeader() {
  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-blue-600 hover:text-blue-700 transition-colors">
            Store Management
          </Link>
          <ul className="flex items-center space-x-6">
            <li>
              <Link
                href="/"
                className="text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                href="/about"
                className="text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                About
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                className="text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                Contact
              </Link>
            </li>
            <li>
              <Link
                href="/signup"
                className="text-gray-700 hover:text-blue-600 transition-colors font-medium"
              >
                Sign Up
              </Link>
            </li>
            <li>
              <Link
                href="/login"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Login
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </header>
  );
}

