# The Workflow

## Main Goals
The main goals of this platform are to:
1. Permit users to vote "yes" or "no" on the current team that the admin sets as "presenting" through their dashboard
2. Permit the admin to update the "presenting" team for users via SSE without requiring users to refresh the page

---

## API Documentation

### **User APIs**

#### Registration
- **POST** `/api/register`
  - **Middleware**: None
  - **Body**: `{ "code": "string" }` - Voter's unique code
  - **Response**: Sets session cookie for authenticated user
  - **Purpose**: Register and authenticate a voter using their code

#### Voting
- **POST** `/api/vote/:id`
  - **Parameters**: `:id` - Team ID to vote for
  - **Body**: `{ "vote": "yes" | "no" }`
  - **Middleware**: `requireAuth` (voter session cookie)
  - **Purpose**: Submit a vote for the currently presenting team
  - **Note**: Uses optimistic concurrency control to prevent duplicate votes

#### Check Status
- **GET** `/api/isconnected`
  - **Middleware**: None
  - **Response**: `{ "connected": boolean }`
  - **Purpose**: Check if user has an active session

- **GET** `/api/hasvoted`
  - **Middleware**: `requireAuth` (voter session cookie)
  - **Response**: `{ "voted": boolean, "team": object | null }`
  - **Purpose**: Check if authenticated user has voted for the currently presenting team

- **GET** `/api/hasvoted/:teamId`
  - **Parameters**: `:teamId` - Team ID
  - **Middleware**: `requireAuth` (voter session cookie)
  - **Response**: `{ "voted": boolean }`
  - **Purpose**: Check if user has voted for a specific team

#### Current Presenting Team
- **GET** `/api/currentteam`
  - **Middleware**: None
  - **Response**: `{ "teamID": "string", "teamName": "string" }` or `{ "teamID": null }`
  - **Purpose**: Get the currently presenting team that users can vote on

#### Position Verification
- **POST** `/api/verifyPosition`
  - **Middleware**: None
  - **Body**: `{ "position": "string" }` - User's position/location
  - **Purpose**: Verify user's physical position (if required)

#### Server-Sent Events (SSE)
- **GET** `/api/sendvote`
  - **Middleware**: None
  - **Response**: Event stream
  - **Events**:
    - `presenting-team-change`: Notifies when presenting team changes
  - **Purpose**: Real-time updates for presenting team changes without page refresh

---

### **Admin APIs**

#### Authentication
- **POST** `/api/admin/login`
  - **Middleware**: None
  - **Body**: `{ "secretKey": "string" }` - Admin secret key
  - **Response**: Sets `adminToken` httpOnly cookie
  - **Purpose**: Authenticate admin user

- **GET** `/api/admin/auth`
  - **Middleware**: None (validates adminToken internally)
  - **Response**: `{ "authenticated": boolean, "admin": boolean }`
  - **Purpose**: Check if admin is authenticated

- **POST** `/api/admin/logout`
  - **Middleware**: None (clears cookie regardless)
  - **Response**: Clears admin session cookie
  - **Purpose**: Log out admin user

#### Team Management
- **POST** `/api/admin/team`
  - **Middleware**: None (open endpoint for team creation)
  - **Body**: `{ "teamName": "string", "projectDescription": "string", "members": ["string"] }`
  - **Response**: Created team object
  - **Purpose**: Create a new team

- **PUT** `/api/admin/team/:id`
  - **Middleware**: `requireAdmin` (adminToken cookie)
  - **Parameters**: `:id` - Team ID
  - **Body**: Team update fields
  - **Response**: Updated team object
  - **Purpose**: Update team information

- **DELETE** `/api/admin/team/:id`
  - **Middleware**: `requireAdmin` (adminToken cookie)
  - **Parameters**: `:id` - Team ID
  - **Response**: Success confirmation
  - **Purpose**: Delete a team

#### Presenting Team Control
- **POST** `/api/admin/presenting`
  - **Middleware**: `requireAdmin` (adminToken cookie)
  - **Body**: `{ "teamId": "string" }`
  - **Response**: Updated team object
  - **Purpose**: Set a team as currently presenting (triggers SSE update to all connected users)

- **GET** `/api/admin/presenting`
  - **Middleware**: `requireAdmin` (adminToken cookie)
  - **Response**: Currently presenting team object or null
  - **Purpose**: Get the currently presenting team

- **DELETE** `/api/admin/presenting`
  - **Middleware**: `requireAdmin` (adminToken cookie)
  - **Response**: Success confirmation
  - **Purpose**: Clear the currently presenting team

#### Visualization/Statistics
- **GET** `/api/admin/teams`
  - **Middleware**: `requireAdmin` (adminToken cookie)
  - **Response**: Array of all teams with vote counts
  - **Purpose**: Get all teams and their voting statistics

---

## Architecture Notes

### Authentication
- **Users**: Session-based authentication via signed cookies containing voter code
- **Admins**: JWT-based authentication via httpOnly cookies

### Concurrency Control
- **Voting**: Uses MongoDB atomic operations with optimistic concurrency control
  - `findOneAndUpdate` with `$exists: false` check prevents duplicate votes
  - No transactions needed, eliminating lock contention
  - Achieves 100% success rate with 600+ concurrent users

### Real-Time Updates
- **SSE (Server-Sent Events)**: Used for pushing presenting team updates to all connected users
- **No polling required**: Users automatically receive updates when admin changes the presenting team

### Security
- **Environment-based cookie settings**:
  - Production: `secure: true`, `sameSite: "strict"`
  - Staging: `secure: false`, `sameSite: "strict"`
  - Development: `secure: false`, `sameSite: "lax"`
- **Admin secret key**: Stored in environment variables
- **Session secrets**: Stored in environment variables

### Database
- **MongoDB**: Used for storing teams and voters
- **Connection Pool**: maxPoolSize: 50, minPoolSize: 10
- **Retry Logic**: retryWrites and retryReads enabled

---

## Testing

### Load Testing
- **Script**: `stress-test.sh`
- **Features**:
  - Auto-fetches currently presenting team
  - Spawns child processes for true parallel execution
  - 50/50 vote distribution (yes/no)
  - Generates detailed reports with timing and success rates
- **Performance**: Successfully tested with 600 concurrent users at 100% success rate


