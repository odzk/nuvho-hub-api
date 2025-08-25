# Nuvho HotelHub API Server

This is the backend API server for Nuvho HotelHub, a hotel CRM system.

## Features

- User authentication (register, login, forgot password)
- JWT-based authentication
- In-memory user storage (can be replaced with a real database)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/hotel-crm-api.git
cd hotel-crm-api
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following content:
```
PORT=5000
JWT_SECRET=your-secret-key
NODE_ENV=development
```

4. Start the development server:
```bash
npm run dev
```

The server will be running at `http://localhost:5000`.

## API Endpoints

### Authentication

- **POST /api/auth/register** - Register a new user
  - Request body: `{ email, password, firstName, lastName, hotelName }`
  - Response: `{ message, user, token }`

- **POST /api/auth/login** - Login a user
  - Request body: `{ email, password }`
  - Response: `{ message, user, token }`

- **POST /api/auth/forgot-password** - Request password reset
  - Request body: `{ email }`
  - Response: `{ message }`

- **GET /api/auth/me** - Get current user (protected route)
  - Headers: `Authorization: Bearer [token]`
  - Response: `{ id, email, firstName, lastName, hotelName, role }`

## Future Improvements

- Connect to a real database (MongoDB, PostgreSQL)
- Add more API endpoints for hotel management
- Implement password reset functionality with email
- Add user roles and permissions

## License

MIT