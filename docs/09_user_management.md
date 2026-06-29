# 9. User Management

CLL Genie implements a clean Role-Based Access Control (RBAC) system. Administrators can manage who has access to the application and what actions they can perform.

## The Users Interface

To access User Management, you must be logged in as an Administrator. Navigate to **Admin > Users** from the sidebar.

Here you will see a table of all registered users with their:
- **Username**
- **Email**
- **Role** (`user`, `admin`, or `lymphotrack_admin`)
- **Status** (Enabled / Disabled)

## User Document Schema

Users are stored in `APPLICATION_DATABASE.USERS_COLLECTION`. MongoDB generates `_id` as an `ObjectId`; application login and updates use the unique `username` and `email` fields.

Existing users in a separate Coyote database are not read or migrated automatically. Import the required profiles into the configured CLL Genie users collection before switching deployments; existing sessions from the old database are intentionally not retained.

```javascript
{
  _id: ObjectId("5f7e1c8b8f8c8b8f8c8b8f8c"),
  username: "example-user",
  password: "pbkdf2:sha256:...", // Optional for LDAP-only users
  fullname: "Example User",
  firstname: "Example",
  lastname: "User",
  email: "example.user@example.org",
  roles: ["admin", "lymphotrack_admin", "user"],
  enabled: true,
  created_at: ISODate("2026-01-01T12:00:00Z"),
  updated_at: ISODate("2026-01-01T12:00:00Z"),
  created_by: "system",
  updated_by: "system"
}
```

Authentication and authorization use `username`, `password`, `fullname`, `email`, `roles`, and `enabled`. The name components and audit fields are stored for administration and traceability. `enabled` is the only application field beyond the proposed base structure; if omitted, it is treated as `true`.

## Adding a New User

1. Click **"Add User"** in the top right.
2. Fill in the username, name, and email fields.
3. Provide a local password if local login is required. LDAP-only users do not need a local password.
4. Select the appropriate roles and enabled state.

### Understanding Roles

The system is simplified into broad access categories:

- **`user`**: The standard role. Can view samples, upload sequences, run analysis, and generate reports. Cannot manage other users or access the Rule Builder.
- **`admin` / `lymphotrack_admin`**: Administrator roles. These users have full access to the application, including:
  - Adding, editing, and disabling users.
  - Creating and modifying clinical interpretation rules in the Rule Builder.
  - Viewing and restoring Hidden Comments and Hidden Reports.

## Managing Existing Users

Administrators can perform several actions on existing users by clicking the respective buttons in the table row:

- **Edit Role:** Change a standard user to an admin or vice-versa.
- **Reset Password:** Useful if a user forgets their credentials.
- **Enable / Disable:** You cannot permanently delete a user (to preserve audit integrity for actions they have taken in the past). Instead, you can toggle their `Disabled` state. A disabled user will be immediately rejected at the login screen.

> [!IMPORTANT]
> There is no default administrator. An initial administrator record must be created or imported directly before the Users interface can be accessed.
