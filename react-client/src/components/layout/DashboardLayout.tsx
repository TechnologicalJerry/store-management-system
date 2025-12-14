"use client";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DashboardFooter from "./DashboardFooter";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-64">
        {/* Topbar/Header */}
        <Topbar />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            {children}
          </div>
        </main>

        {/* Footer */}
        <DashboardFooter />
      </div>
    </div>
  );
}
