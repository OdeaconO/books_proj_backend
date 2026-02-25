# 📚 Books Project – Backend

## VISIT THE SITE @ → [kamitoshi.com](https://www.kamitoshi.com)

## 🚀 Overview

This is the backend API for the Books Project.

It is built using:

- Node.js
- Express
- MySQL
- JWT Authentication

The backend handles:

- User authentication (register/login)
- Book CRUD operations
- Image uploads
- Rate limiting & security
- CSV imports
- Cloud image storage

## 🛠 Tech Stack

### Core

- express
- mysql2
- dotenv

### Authentication

- bcrypt
- jsonwebtoken

### Security

- helmet
- cors
- express-rate-limit

### Logging

- morgan

### File Uploads

- multer
- cloudinary

### CSV Handling

- csv-parser

## 🔐 Security Middleware

### Helmet

Adds security-related HTTP headers.

```bash
app.use(helmet());
```

Helps prevent:

- XSS attacks
- Clickjacking
- MIME sniffing

### Rate Limiting

```bash
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
});
```

- Limits general API traffic
- 300 requests per 15 minutes per IP in this application

```bash
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});
```

- Applied only to /auth
- Prevents brute-force login attacks

### Morgan (HTTP Logger)

```bash
app.use(morgan("combined"));
```

Logs all incoming HTTP requests including:

- Method
- Route
- Status
- Response time
- IP address

Useful for:

- Debugging
- Monitoring
- Production logging

## 🔑 Authentication System

Uses:

- bcrypt → password hashing
- jsonwebtoken → JWT-based authentication

### Flow

1. User registers
2. Password is hashed with bcrypt
3. On login:
   - Password is compared
   - JWT token is generated
4. Token is sent in Authorization header for protected routes

## 📦 File Uploads

### Multer

Handles:

- Image uploads
- File parsing from multipart/form-data

### Cloudinary

- Stores uploaded book cover images
- Returns hosted image URL
- Reduces server storage usage

## 📡 API Features

### Authentication

- POST /auth/register
- POST /auth/login

### Books

- GET /books
- GET /books/:id
- POST /books
- PUT /books/:id
- DELETE /books/:id

Protected routes require JWT.

## ⚙️ Environment Variables

Create a .env file in the root:

```bash
PORT=
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
JWT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```
