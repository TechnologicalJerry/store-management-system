# Backend API Setup Guide

## Required Dependencies

Install the following packages:

```bash
npm install mongoose bcryptjs jsonwebtoken zod
npm install --save-dev @types/bcryptjs @types/jsonwebtoken
```

## Environment Variables

### Quick Setup

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and update the values with your actual configuration.

### Environment Variables

The `.env.local` file should contain the following variables:

```env
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/store-management-system
# Or for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/store-management-system

# JWT Secrets (change these in production!)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Application
NODE_ENV=development
PORT=3000

# Frontend URL (for password reset links)
FRONTEND_URL=http://localhost:3000

# Email Configuration (Optional - for password reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@storemanagement.com
```

## MongoDB Setup

### Local MongoDB
1. Install MongoDB locally or use Docker:
   ```bash
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```

### MongoDB Atlas (Cloud)
1. Create an account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Get your connection string
4. Update `MONGODB_URI` in `.env.local`

## API Endpoints

### POST `/api/auth/login`
- **Body**: `{ email: string, password: string }`
- **Response**: User data with JWT tokens (stored in HTTP-only cookies)

### POST `/api/auth/signup`
- **Body**: 
  ```json
  {
    "email": "string",
    "password": "string",
    "confirmPassword": "string",
    "userName": "string",
    "firstName": "string",
    "lastName": "string",
    "gender": "male" | "female" | "other" | "prefer-not-to-say",
    "dob": "YYYY-MM-DD",
    "phone": "string",
    "role": "admin" | "supervisor" | "user"
  }
  ```
- **Response**: User data with JWT tokens (stored in HTTP-only cookies)

### POST `/api/auth/forgot-password`
- **Body**: `{ email: string }`
- **Response**: Success message (always returns success for security)

### POST `/api/auth/reset-password`
- **Body**: `{ token: string, password: string }`
- **Response**: User data with new JWT tokens

## Features Implemented

✅ User registration with full profile
✅ User login with JWT authentication
✅ Password hashing with bcrypt
✅ JWT token generation and validation
✅ Password reset flow
✅ Input validation with Zod
✅ Error handling
✅ MongoDB connection with Mongoose
✅ HTTP-only cookies for secure token storage

## Security Features

- Passwords are hashed using bcrypt before storage
- JWT tokens stored in HTTP-only cookies
- Password reset tokens are hashed and expire after 1 hour
- Input validation prevents injection attacks
- Duplicate email/username prevention

## Next Steps

1. Install dependencies: `npm install`
2. Set up MongoDB (local or Atlas)
3. Create `.env.local` with your configuration
4. Start the development server: `npm run dev`
5. Test the API endpoints using the frontend forms or Postman

