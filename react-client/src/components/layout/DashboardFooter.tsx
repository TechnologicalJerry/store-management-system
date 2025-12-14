export default function DashboardFooter() {
  return (
    <footer className="bg-white border-t border-gray-200 py-4 px-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <p className="text-sm text-gray-600">
          &copy; {new Date().getFullYear()} Store Management System. All rights reserved.
        </p>
        <div className="flex items-center space-x-4 mt-2 md:mt-0">
          <a href="/about" className="text-sm text-gray-600 hover:text-blue-600">
            About
          </a>
          <a href="/contact" className="text-sm text-gray-600 hover:text-blue-600">
            Contact
          </a>
          <a href="/dashboard/settings" className="text-sm text-gray-600 hover:text-blue-600">
            Settings
          </a>
        </div>
      </div>
    </footer>
  );
}

