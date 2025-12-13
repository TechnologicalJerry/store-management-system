# Store Management System - Architecture & File Structure Documentation

## 📋 Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Detailed File Descriptions](#detailed-file-descriptions)
5. [Route Groups & Pages](#route-groups--pages)
6. [API Routes](#api-routes)
7. [Components](#components)
8. [Models & Database](#models--database)
9. [Services](#services)
10. [Context & State Management](#context--state-management)
11. [Hooks](#hooks)
12. [Types & Interfaces](#types--interfaces)
13. [Utilities & Libraries](#utilities--libraries)
14. [Configuration](#configuration)
15. [Middleware & Security](#middleware--security)

---

## Overview

This is a **Store Management System** built with **Next.js 16** (App Router), **TypeScript**, and **MongoDB** (Mongoose). The application follows a modular architecture with clear separation of concerns, role-based access control (RBAC), and modern React patterns.

### Key Features
- 🔐 Authentication & Authorization (JWT-based)
- 👥 Role-based Access Control (Admin, Supervisor, User)
- 📦 Product Management
- 🛒 Order Processing
- 📊 Inventory Tracking
- 👤 Customer Management
- 📈 Reporting & Analytics
- 🎨 Theme Support (Dark/Light mode)
- 📱 Responsive Design

---

## Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: MongoDB (Mongoose ODM)
- **State Management**: React Context API + React Query
- **Styling**: Tailwind CSS
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Schema-based validation (Zod/Yup)
- **File Upload**: Multer or Next.js native upload
- **Logging**: Winston/Pino

---

## Project Structure

```
src/
├── app/                    # Next.js App Router pages and API routes
├── components/             # React components organized by feature
├── models/                 # MongoDB Mongoose models
├── db/                     # Database configuration and utilities
├── context/                # React Context providers
├── hooks/                  # Custom React hooks
├── lib/                    # Shared libraries and utilities
├── services/               # Business logic services
├── types/                  # TypeScript type definitions
├── utils/                  # Utility functions
├── config/                 # Configuration files
└── middleware.ts           # Next.js middleware for route protection
```

---

## Detailed File Descriptions

### 📁 `src/app/` - Next.js App Router

The `app` directory uses Next.js 13+ App Router with route groups `(public)`, `(auth)`, and `(dashboard)` for organization.

#### Route Groups

##### `(public)/` - Public Pages
Public-facing pages accessible without authentication.

| File | Purpose | Route |
|------|---------|-------|
| `layout.tsx` | Public layout wrapper | N/A |
| `page.tsx` | Home/Landing page | `/` |
| `about/page.tsx` | About page | `/about` |
| `contact/page.tsx` | Contact page | `/contact` |
| `not-found.tsx` | 404 error page | N/A |

**Key Features:**
- No authentication required
- PublicHeader and PublicFooter components
- SEO-optimized meta tags

##### `(auth)/` - Authentication Pages
Authentication-related pages for login, signup, and password management.

| File | Purpose | Route |
|------|---------|-------|
| `layout.tsx` | Auth layout wrapper | N/A |
| `login/page.tsx` | User login page | `/login` |
| `signup/page.tsx` | User registration | `/signup` |
| `forgot-password/page.tsx` | Password recovery request | `/forgot-password` |
| `reset-password/[token]/page.tsx` | Password reset form | `/reset-password/:token` |

**Key Features:**
- Redirects authenticated users to dashboard
- Form validation and error handling
- Integration with auth API routes

##### `(dashboard)/` - Protected Dashboard Pages
All dashboard pages are protected and require authentication. Role-based access is enforced via middleware.

| File | Purpose | Route | Access Level |
|------|---------|-------|--------------|
| `layout.tsx` | Dashboard layout with Sidebar/Topbar | N/A | All authenticated |
| `page.tsx` | Dashboard home/overview | `/dashboard` | All authenticated |
| `profile/page.tsx` | User profile management | `/dashboard/profile` | All authenticated |
| `settings/page.tsx` | User settings | `/dashboard/settings` | All authenticated |
| `products/page.tsx` | Products list | `/dashboard/products` | All authenticated |
| `products/new/page.tsx` | Create new product | `/dashboard/products/new` | Supervisor+ |
| `products/[id]/page.tsx` | Product details | `/dashboard/products/:id` | All authenticated |
| `products/[id]/edit/page.tsx` | Edit product | `/dashboard/products/:id/edit` | Supervisor+ |
| `orders/page.tsx` | Orders list | `/dashboard/orders` | All authenticated |
| `orders/[id]/page.tsx` | Order details | `/dashboard/orders/:id` | All authenticated |
| `inventory/page.tsx` | Inventory management | `/dashboard/inventory` | All authenticated |
| `customers/page.tsx` | Customers list | `/dashboard/customers` | Supervisor+ |
| `customers/[id]/page.tsx` | Customer details | `/dashboard/customers/:id` | Supervisor+ |
| `reports/page.tsx` | Reports overview | `/dashboard/reports` | Supervisor+ |
| `reports/sales/page.tsx` | Sales reports | `/dashboard/reports/sales` | Supervisor+ |
| `reports/inventory/page.tsx` | Inventory reports | `/dashboard/reports/inventory` | Supervisor+ |
| `users/page.tsx` | User management | `/dashboard/users` | Admin only |
| `users/[id]/page.tsx` | User details | `/dashboard/users/:id` | Admin only |
| `not-found.tsx` | Dashboard 404 page | N/A | All authenticated |

**Key Features:**
- Protected by middleware
- Role-based rendering (RoleGuard component)
- DashboardLayout with Sidebar and Topbar
- Breadcrumbs navigation

#### `api/` - API Route Handlers
Next.js API routes (server-side) for handling HTTP requests.

##### `api/auth/` - Authentication Endpoints

| File | Method | Purpose | Request Body | Response |
|------|--------|---------|--------------|----------|
| `login/route.ts` | POST | User login | `{ email, password }` | `{ token, user }` |
| `signup/route.ts` | POST | User registration | `{ email, password, name, role? }` | `{ token, user }` |
| `logout/route.ts` | POST | User logout | `{}` | `{ message }` |
| `refresh/route.ts` | POST | Refresh JWT token | `{ refreshToken }` | `{ token }` |
| `forgot-password/route.ts` | POST | Send reset email | `{ email }` | `{ message }` |
| `reset-password/route.ts` | POST | Reset password | `{ token, password }` | `{ message }` |
| `me/route.ts` | GET | Get current user | Headers: `Authorization` | `{ user }` |

**Implementation Notes:**
- All routes validate input using schema validators
- JWT tokens stored in HTTP-only cookies
- Password hashing using bcrypt
- Rate limiting applied

##### `api/products/` - Product Management

| File | Method | Purpose | Access |
|------|--------|---------|--------|
| `route.ts` | GET | List all products | All authenticated |
| `route.ts` | POST | Create product | Supervisor+ |
| `[id]/route.ts` | GET | Get product by ID | All authenticated |
| `[id]/route.ts` | PUT | Update product | Supervisor+ |
| `[id]/route.ts` | DELETE | Delete product | Admin only |

**Request/Response Examples:**
- GET `/api/products?page=1&limit=10&search=...&category=...`
- POST `/api/products` body: `{ name, price, category, description, stock, image? }`

##### `api/orders/` - Order Management

| File | Method | Purpose | Access |
|------|--------|---------|--------|
| `route.ts` | GET | List orders | All authenticated |
| `route.ts` | POST | Create order | All authenticated |
| `[id]/route.ts` | GET | Get order details | All authenticated |
| `[id]/route.ts` | PUT | Update order | Supervisor+ |
| `[id]/status/route.ts` | PATCH | Update order status | Supervisor+ |

**Order Status Flow:**
- `pending` → `processing` → `shipped` → `delivered` / `cancelled`

##### `api/inventory/` - Inventory Management

| File | Method | Purpose | Access |
|------|--------|---------|--------|
| `route.ts` | GET | List inventory | All authenticated |
| `[id]/route.ts` | GET | Get inventory item | All authenticated |
| `[id]/route.ts` | PUT | Update stock | All authenticated |

**Features:**
- Low stock alerts
- Stock movement tracking
- Inventory reports

##### `api/customers/` - Customer Management

| File | Method | Purpose | Access |
|------|--------|---------|--------|
| `route.ts` | GET | List customers | Supervisor+ |
| `route.ts` | POST | Create customer | Supervisor+ |
| `[id]/route.ts` | GET | Get customer | Supervisor+ |
| `[id]/route.ts` | PUT | Update customer | Supervisor+ |
| `[id]/route.ts` | DELETE | Delete customer | Admin only |

##### `api/users/` - User Management (Admin Only)

| File | Method | Purpose | Access |
|------|--------|---------|--------|
| `route.ts` | GET | List users | Admin |
| `route.ts` | POST | Create user | Admin |
| `[id]/route.ts` | GET | Get user | Admin |
| `[id]/route.ts` | PUT | Update user | Admin |
| `[id]/route.ts` | DELETE | Delete user | Admin |

##### `api/reports/` - Reporting

| File | Method | Purpose | Access |
|------|--------|---------|--------|
| `sales/route.ts` | GET | Generate sales report | Supervisor+ |
| `inventory/route.ts` | GET | Generate inventory report | Supervisor+ |

**Query Parameters:**
- `startDate`, `endDate` for date ranges
- `format` (json/csv/pdf) for export

##### `api/upload/` - File Upload

| File | Method | Purpose | Access |
|------|--------|---------|--------|
| `route.ts` | POST | Upload files (images, documents) | Authenticated |

**Features:**
- Image validation
- File size limits
- Cloud storage integration (optional)

---

### 📁 `src/components/` - React Components

Components are organized by feature/domain for maintainability.

#### `layout/` - Layout Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `PublicHeader.tsx` | Header for public pages | `{ navigationItems }` |
| `PublicFooter.tsx` | Footer for public pages | `{ links, copyright }` |
| `DashboardLayout.tsx` | Main dashboard wrapper | `{ children }` |
| `Sidebar.tsx` | Navigation sidebar | `{ isOpen, onClose }` |
| `Topbar.tsx` | Top navigation bar | `{ user, notifications }` |
| `Breadcrumbs.tsx` | Breadcrumb navigation | `{ items }` |
| `ThemeSwitcher.tsx` | Dark/Light mode toggle | `{ theme, onToggle }` |

#### `dashboard/` - Dashboard-Specific Components

| Component | Purpose |
|-----------|---------|
| `SidebarItem.tsx` | Single sidebar navigation item |
| `DashboardStats.tsx` | Statistics cards (revenue, orders, products, customers) |
| `QuickActions.tsx` | Quick action buttons |
| `sidebar/AdminSidebarItems.tsx` | Menu items for Admin role |
| `sidebar/SupervisorSidebarItems.tsx` | Menu items for Supervisor role |
| `sidebar/UserSidebarItems.tsx` | Menu items for User role |
| `sidebar/RoleSidebar.tsx` | Role-aware sidebar renderer |

#### `auth/` - Authentication Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `LoginForm.tsx` | Login form with validation | `{ onSuccess, onError }` |
| `SignupForm.tsx` | Registration form | `{ onSuccess, onError }` |
| `ForgotPasswordForm.tsx` | Password recovery form | `{ onSuccess }` |
| `ResetPasswordForm.tsx` | Password reset form | `{ token, onSuccess }` |
| `ProtectedRoute.tsx` | HOC for protected routes | `{ children, redirectTo? }` |
| `RoleGuard.tsx` | Role-based access guard | `{ children, requiredRole, requiredPermission? }` |

**Example Usage:**
```tsx
<RoleGuard requiredRole="supervisor" requiredPermission="products:create">
  <CreateProductButton />
</RoleGuard>
```

#### `products/` - Product Components

| Component | Purpose |
|-----------|---------|
| `ProductCard.tsx` | Product card for grid/list view |
| `ProductForm.tsx` | Create/Edit product form |
| `ProductList.tsx` | Products list with pagination |
| `ProductFilter.tsx` | Filter/search component |

#### `orders/` - Order Components

| Component | Purpose |
|-----------|---------|
| `OrderTable.tsx` | Orders table with sorting/filtering |
| `OrderDetails.tsx` | Detailed order view |
| `OrderStatusBadge.tsx` | Status badge component |
| `OrderFilter.tsx` | Order filtering component |

#### `customers/` - Customer Components

| Component | Purpose |
|-----------|---------|
| `CustomerTable.tsx` | Customers table |
| `CustomerDetails.tsx` | Customer profile/details |
| `CustomerCard.tsx` | Customer card component |

#### `inventory/` - Inventory Components

| Component | Purpose |
|-----------|---------|
| `StockTable.tsx` | Inventory stock table |
| `UpdateStockForm.tsx` | Stock update form |
| `LowStockAlert.tsx` | Low stock warning component |

#### `reports/` - Reporting Components

| Component | Purpose |
|-----------|---------|
| `SalesReport.tsx` | Sales report visualization |
| `InventoryReport.tsx` | Inventory report visualization |
| `ReportFilters.tsx` | Date range and filter controls |

#### `users/` - User Management Components

| Component | Purpose |
|-----------|---------|
| `UserTable.tsx` | Users table (Admin only) |
| `UserForm.tsx` | Create/Edit user form |
| `RoleBadge.tsx` | Role display badge |

#### `ui/` - Reusable UI Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `Button.tsx` | Button component | `{ variant, size, onClick, disabled }` |
| `Input.tsx` | Text input | `{ type, placeholder, value, onChange, error }` |
| `TextArea.tsx` | Textarea input | `{ value, onChange, rows }` |
| `Modal.tsx` | Modal dialog | `{ isOpen, onClose, title, children }` |
| `Select.tsx` | Dropdown select | `{ options, value, onChange }` |
| `Table.tsx` | Data table | `{ columns, data, pagination }` |
| `Card.tsx` | Card container | `{ title, children, footer }` |
| `Loader.tsx` | Loading spinner | `{ size, color }` |
| `Spinner.tsx` | Loading spinner variant | `{ size }` |
| `Pagination.tsx` | Pagination controls | `{ current, total, onPageChange }` |
| `Toast.tsx` | Toast notification | `{ message, type, duration }` |
| `Badge.tsx` | Status badge | `{ variant, children }` |
| `Tabs.tsx` | Tab navigation | `{ tabs, activeTab, onChange }` |
| `Dropdown.tsx` | Dropdown menu | `{ trigger, items }` |

**UI Component Patterns:**
- All components accept `className` for custom styling
- Support for Tailwind CSS variants
- Accessibility (a11y) compliant
- TypeScript interfaces for props

#### `charts/` - Chart Components

| Component | Purpose | Props |
|-----------|---------|-------|
| `LineChart.tsx` | Line chart for trends | `{ data, labels, options }` |
| `BarChart.tsx` | Bar chart for comparisons | `{ data, labels, options }` |
| `PieChart.tsx` | Pie chart for distributions | `{ data, options }` |
| `AreaChart.tsx` | Area chart for cumulative data | `{ data, labels, options }` |

**Chart Library:** Chart.js or Recharts (to be decided)

---

### 📁 `src/models/` - MongoDB Mongoose Models

Mongoose schemas and models for database entities.

| File | Model | Key Fields | Indexes |
|------|-------|------------|---------|
| `User.ts` | User | `email`, `password`, `name`, `role`, `permissions`, `status` | `email` (unique), `role` |
| `Product.ts` | Product | `name`, `price`, `category`, `description`, `stock`, `images`, `sku` | `sku` (unique), `name`, `category` |
| `Order.ts` | Order | `customerId`, `items`, `total`, `status`, `paymentMethod`, `shippingAddress` | `customerId`, `status`, `createdAt` |
| `Customer.ts` | Customer | `name`, `email`, `phone`, `address`, `totalOrders`, `totalSpent` | `email` (unique) |
| `Inventory.ts` | Inventory | `productId`, `quantity`, `lowStockThreshold`, `lastUpdated` | `productId` (unique) |
| `AuditLog.ts` | AuditLog | `userId`, `action`, `resource`, `changes`, `timestamp` | `userId`, `timestamp`, `resource` |

**Model Relationships:**
- Order → Customer (Many-to-One)
- Order → Product (Many-to-Many via items)
- Inventory → Product (One-to-One)
- AuditLog → User (Many-to-One)

**Validation:**
- Email format validation
- Required field validation
- Data type validation
- Custom validators (e.g., SKU format)

---

### 📁 `src/db/` - Database Configuration

| File | Purpose |
|------|---------|
| `connection.ts` | Mongoose connection setup, connection pooling, error handling |
| `seed.ts` | Database seeding script (initial data: admin user, sample products) |
| `indexes.ts` | Database index definitions for performance optimization |

**Connection Example:**
```typescript
// db/connection.ts
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
});
```

---

### 📁 `src/services/` - Business Logic Services

Services contain business logic and database operations. They are used by API routes and can be called from components (via hooks).

| File | Purpose | Key Functions |
|------|---------|---------------|
| `auth.service.ts` | Authentication logic | `login()`, `register()`, `validateToken()`, `hashPassword()` |
| `product.service.ts` | Product operations | `createProduct()`, `getProducts()`, `updateProduct()`, `deleteProduct()` |
| `order.service.ts` | Order operations | `createOrder()`, `getOrders()`, `updateOrderStatus()`, `calculateTotal()` |
| `customer.service.ts` | Customer operations | `createCustomer()`, `getCustomers()`, `updateCustomer()`, `getCustomerStats()` |
| `inventory.service.ts` | Inventory operations | `updateStock()`, `checkLowStock()`, `getInventoryReport()` |
| `user.service.ts` | User management | `createUser()`, `getUsers()`, `updateUser()`, `deleteUser()`, `assignRole()` |
| `email.service.ts` | Email notifications | `sendResetEmail()`, `sendOrderConfirmation()`, `sendWelcomeEmail()` |
| `report.service.ts` | Report generation | `generateSalesReport()`, `generateInventoryReport()`, `exportReport()` |

**Service Pattern:**
- Pure functions (no side effects, except DB operations)
- Error handling with custom errors
- Transaction support where needed
- Input validation before processing

---

### 📁 `src/context/` - React Context Providers

Context providers for global state management.

| File | Purpose | Exported Values |
|------|---------|-----------------|
| `AuthContext.tsx` | Authentication state | `{ user, token, login, logout, isAuthenticated }` |
| `RoleContext.tsx` | Role/permissions state | `{ role, permissions, hasPermission, hasRole }` |
| `ThemeContext.tsx` | Theme state (dark/light) | `{ theme, toggleTheme }` |
| `QueryProvider.tsx` | React Query provider | Wraps app with QueryClient |

**Usage Example:**
```tsx
const { user, logout } = useAuth();
const { hasPermission } = useRole();
const { theme, toggleTheme } = useTheme();
```

---

### 📁 `src/hooks/` - Custom React Hooks

Reusable hooks for common functionality.

| File | Purpose | Returns |
|------|---------|---------|
| `useAuth.ts` | Auth context hook | `{ user, login, logout, isLoading }` |
| `useRole.ts` | Role context hook | `{ role, permissions, hasPermission }` |
| `useSidebar.ts` | Sidebar state | `{ isOpen, toggle, close }` |
| `usePagination.ts` | Pagination logic | `{ page, limit, total, setPage, setLimit }` |
| `useProducts.ts` | Products data (React Query) | `{ products, isLoading, refetch, createProduct }` |
| `useOrders.ts` | Orders data (React Query) | `{ orders, isLoading, refetch, createOrder }` |
| `useCustomers.ts` | Customers data (React Query) | `{ customers, isLoading, refetch }` |

**React Query Integration:**
- Automatic caching
- Background refetching
- Optimistic updates
- Error handling

---

### 📁 `src/lib/` - Shared Libraries & Utilities

Core utility functions and shared logic.

| File | Purpose | Key Functions |
|------|---------|---------------|
| `auth.ts` | Auth utilities | `verifyToken()`, `generateToken()`, `hashPassword()`, `comparePassword()` |
| `jwt.ts` | JWT operations | `sign()`, `verify()`, `decode()` |
| `rbac.ts` | Role-based access control | `checkPermission()`, `checkRole()`, `getUserPermissions()` |
| `api-response.ts` | Standardized API responses | `success()`, `error()`, `validationError()` |
| `error-handler.ts` | Error handling | `handleError()`, `ApiError`, `ValidationError` |
| `logger.ts` | Logging (Winston/Pino) | `info()`, `error()`, `warn()`, `debug()` |
| `storage.ts` | File upload/storage | `uploadFile()`, `deleteFile()`, `getFileUrl()` |
| `rate-limit.ts` | API rate limiting | `rateLimiter()`, `createRateLimiter()` |
| `utils.ts` | General utilities | `formatCurrency()`, `formatDate()`, `debounce()`, `throttle()` |

#### `lib/validators/` - Validation Schemas

| File | Purpose | Validates |
|------|---------|-----------|
| `auth.schema.ts` | Auth input validation | Login, signup, password reset |
| `product.schema.ts` | Product validation | Product create/update |
| `order.schema.ts` | Order validation | Order create/update |
| `customer.schema.ts` | Customer validation | Customer create/update |
| `user.schema.ts` | User validation | User create/update |

**Validation Library:** Zod or Yup (recommended: Zod)

**Example:**
```typescript
// lib/validators/product.schema.ts
export const productSchema = z.object({
  name: z.string().min(3).max(100),
  price: z.number().positive(),
  stock: z.number().int().min(0),
});
```

---

### 📁 `src/types/` - TypeScript Type Definitions

Type definitions for TypeScript type safety.

| File | Purpose | Key Types |
|------|---------|-----------|
| `auth.d.ts` | Authentication types | `LoginInput`, `SignupInput`, `AuthResponse`, `TokenPayload` |
| `user.d.ts` | User types | `User`, `UserRole`, `UserStatus`, `CreateUserInput` |
| `product.d.ts` | Product types | `Product`, `ProductCategory`, `CreateProductInput` |
| `order.d.ts` | Order types | `Order`, `OrderStatus`, `OrderItem`, `CreateOrderInput` |
| `customer.d.ts` | Customer types | `Customer`, `CreateCustomerInput` |
| `inventory.d.ts` | Inventory types | `Inventory`, `StockUpdate` |
| `api.d.ts` | API response types | `ApiResponse<T>`, `ApiError`, `PaginatedResponse<T>` |
| `common.d.ts` | Common types | `PaginationParams`, `SortOrder`, `DateRange` |

**Type Examples:**
```typescript
// types/user.d.ts
export type UserRole = 'admin' | 'supervisor' | 'user';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface User {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

---

### 📁 `src/utils/` - Utility Functions

Helper functions used across the application.

| File | Purpose | Key Functions |
|------|---------|---------------|
| `formatter.ts` | Data formatting | `formatCurrency()`, `formatDate()`, `formatPhone()` |
| `constants.ts` | Application constants | `ROLES`, `ORDER_STATUSES`, `PRODUCT_CATEGORIES`, `API_ENDPOINTS` |
| `permissions.ts` | Permission mappings | `ROLE_PERMISSIONS`, `checkPermission()` |
| `helpers.ts` | General helpers | `generateId()`, `slugify()`, `validateEmail()` |

**Constants Example:**
```typescript
// utils/constants.ts
export const ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  USER: 'user',
} as const;

export const ORDER_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
} as const;
```

---

### 📁 `src/config/` - Configuration Files

Application configuration and environment variable validation.

| File | Purpose |
|------|---------|
| `env.ts` | Environment variable validation (using Zod) |
| `app.config.ts` | Application settings (constants, feature flags) |

**Environment Variables:**
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `JWT_REFRESH_SECRET` - Refresh token secret
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port
- `API_URL` - API base URL
- `EMAIL_SERVICE_KEY` - Email service API key
- `STORAGE_BUCKET` - File storage bucket name

---

### 📁 `src/middleware.ts` - Next.js Middleware

**Purpose:** Route protection and role-based access control at the middleware level.

**Features:**
- JWT token validation
- Route protection based on authentication status
- Role-based route access control
- Redirects for unauthorized access
- Public route whitelisting

**Middleware Flow:**
1. Check if route requires authentication
2. Validate JWT token from cookies/headers
3. Check user role and permissions
4. Allow/deny access or redirect

**Example:**
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get('token');
  
  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    
    // Check role for admin routes
    if (request.nextUrl.pathname.startsWith('/dashboard/users')) {
      const user = verifyToken(token.value);
      if (user.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  }
  
  return NextResponse.next();
}
```

---

## File Naming Conventions

- **Pages**: `page.tsx` (Next.js convention)
- **Layouts**: `layout.tsx`
- **Components**: `PascalCase.tsx`
- **Hooks**: `use*.ts`
- **Services**: `*.service.ts`
- **Types**: `*.d.ts` or `*.ts`
- **Utils**: `*.ts` (camelCase)
- **Constants**: `constants.ts` or `*.constants.ts`

---

## Route Protection Strategy

1. **Middleware Level**: Basic authentication check and role validation
2. **Component Level**: `ProtectedRoute` and `RoleGuard` components
3. **API Level**: JWT validation in each API route handler
4. **Service Level**: Permission checks in service functions

---

## Data Flow

```
User Action → Component → Hook → API Route → Service → Model → Database
                                    ↓
                              Response → Hook → Component → UI Update
```

---

## State Management Strategy

- **Global State**: React Context (Auth, Role, Theme)
- **Server State**: React Query (API data, caching, mutations)
- **Local State**: useState, useReducer
- **URL State**: Next.js router (query params, path params)

---

## Security Best Practices

1. **Authentication**: JWT tokens in HTTP-only cookies
2. **Authorization**: Role-based access control (RBAC)
3. **Input Validation**: Schema validation on all inputs
4. **Rate Limiting**: API rate limiting to prevent abuse
5. **SQL Injection**: Mongoose handles parameterized queries
6. **XSS Protection**: React automatically escapes content
7. **CSRF Protection**: Next.js built-in CSRF protection
8. **Password Hashing**: bcrypt with salt rounds
9. **Audit Logging**: All sensitive operations logged
10. **Environment Variables**: Sensitive data in .env files

---

## Testing Strategy (Future)

- **Unit Tests**: Jest for utilities, services, hooks
- **Integration Tests**: API route testing
- **Component Tests**: React Testing Library
- **E2E Tests**: Playwright or Cypress

---

## Deployment Considerations

- **Environment Variables**: Configure in hosting platform
- **Database**: MongoDB Atlas or self-hosted
- **File Storage**: Cloud storage (AWS S3, Cloudinary)
- **CDN**: Static assets via Vercel/Next.js CDN
- **Monitoring**: Error tracking (Sentry), analytics
- **Logging**: Centralized logging service

---

## Development Workflow

1. **Local Development**: `npm run dev`
2. **Environment Setup**: Copy `.env.example` to `.env.local`
3. **Database**: Local MongoDB or MongoDB Atlas
4. **Code Style**: ESLint + Prettier (configured)
5. **Type Checking**: TypeScript compiler
6. **Build**: `npm run build`
7. **Production**: `npm start`

---

## Additional Notes

- All API routes use RESTful conventions
- Components follow React best practices (hooks, composition)
- TypeScript strict mode enabled
- Tailwind CSS for styling
- Responsive design (mobile-first)
- Accessibility (WCAG) compliance
- SEO optimization (meta tags, structured data)

---

## Future Enhancements

- [ ] WebSocket support for real-time updates
- [ ] Advanced analytics and dashboards
- [ ] Multi-language support (i18n)
- [ ] Export/Import functionality
- [ ] Advanced search and filtering
- [ ] Email templates customization
- [ ] Payment gateway integration
- [ ] Mobile app (React Native)

---

**Last Updated:** [Date]
**Version:** 1.0.0
**Maintainer:** [Your Name/Team]

