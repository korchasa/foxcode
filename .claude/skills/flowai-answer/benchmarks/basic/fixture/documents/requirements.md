# Software Requirements Specification (SRS)

## 3. Functional requirements

### 3.1 Requirement FR-1: Authentication

- **Description:** Users must be able to log in using their email and password.
- **Acceptance criteria:**
  - Login endpoint exists at `/api/login`.
  - Password must be hashed using bcrypt.
