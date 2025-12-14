export default function AboutPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 text-gray-800 text-center">
            About Us
          </h1>
          
          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Our Mission</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              At Store Management System, we are dedicated to providing businesses with 
              powerful, intuitive tools to manage their operations efficiently. Our mission 
              is to simplify complex business processes and help companies focus on what 
              matters most - growing their business.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We understand that every business is unique, which is why we've built a 
              flexible platform that can adapt to your specific needs while maintaining 
              ease of use and reliability.
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">What We Offer</h2>
            <ul className="space-y-4 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-600 mr-3 font-bold">✓</span>
                <span>
                  <strong className="text-gray-800">Comprehensive Inventory Management:</strong> 
                  Track products, manage stock levels, and receive automated alerts for low inventory.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-3 font-bold">✓</span>
                <span>
                  <strong className="text-gray-800">Order Processing System:</strong> 
                  Streamline your order workflow from creation to delivery with real-time tracking.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-3 font-bold">✓</span>
                <span>
                  <strong className="text-gray-800">Customer Relationship Management:</strong> 
                  Maintain detailed customer profiles and track purchase history for better service.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-3 font-bold">✓</span>
                <span>
                  <strong className="text-gray-800">Advanced Reporting:</strong> 
                  Generate detailed reports on sales, inventory, and business performance.
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-3 font-bold">✓</span>
                <span>
                  <strong className="text-gray-800">Role-Based Access Control:</strong> 
                  Secure your data with customizable user roles and permissions.
                </span>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800">Why Choose Us?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-800">User-Friendly Interface</h3>
                <p className="text-gray-600">
                  Our intuitive design ensures that anyone can use the system without extensive training.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-800">Scalable Solution</h3>
                <p className="text-gray-600">
                  Whether you're a small business or a large enterprise, our system grows with you.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-800">24/7 Support</h3>
                <p className="text-gray-600">
                  Our dedicated support team is always ready to help you succeed.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-800">Secure & Reliable</h3>
                <p className="text-gray-600">
                  Your data is protected with industry-standard security measures.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

