# 9. User Management

CLL Genie implements a clean Role-Based Access Control (RBAC) system. Administrators can manage who has access to the application and what actions they can perform.

## The Users Interface

To access User Management, you must be logged in as an Administrator. Navigate to **Admin > Users** from the sidebar.

Here you will see a table of all registered users with their:
- **Username**
- **Email**
- **Identity** (`LDAP` or `Local`)
- **Roles** (`admin`, `lymphotrack_admin`, and/or `lymphotrack`)
- **Status** (Enabled / Disabled)

## User Document Schema

Users are stored in `APPLICATION_DATABASE.USERS_COLLECTION`. MongoDB generates `_id` as an `ObjectId`; application login and updates use the unique `username` and `email` fields.

Existing users in a separate Coyote database are not read or migrated automatically. Import the required profiles into the configured CLL Genie users collection before switching deployments; existing sessions from the old database are intentionally not retained.

```javascript
{
  _id: ObjectId("5f7e1c8b8f8c8b8f8c8b8f8c"),
  username: "example-user",
  identity_provider: "ldap", // "ldap" or "local"
  fullname: "Example User",
  firstname: "Example",
  lastname: "User",
  email: "example.user@example.org",
  roles: ["lymphotrack_admin", "lymphotrack"],
  enabled: true,
  created_at: ISODate("2026-01-01T12:00:00Z"),
  updated_at: ISODate("2026-01-01T12:00:00Z"),
  created_by: "system",
  updated_by: "system"
}
```

Local records additionally contain a Werkzeug `password` hash; LDAP records must not contain a local password. Authentication uses only the provider declared by `identity_provider`. Authorization and audit attribution always come from this local profile, including for LDAP authentication.

For backward compatibility, records created before `identity_provider` was introduced are interpreted as `local` when they contain a password hash and `ldap` otherwise. Saving the user through the administration page stores the explicit identity. This compatibility rule does not rewrite production documents automatically.

## Adding a New User

1. Click **"Add User"** in the top right.
2. Choose an identity. LDAP is primary and selected by default.
3. Fill in the username, name, and email fields. An LDAP email must match the directory account.
4. Select one or more roles using the colored role controls.
5. For a local identity, enter and confirm a password of at least eight characters. LDAP users cannot be assigned a local password.
6. Choose the enabled state and create the account.

### Understanding Roles

Role badges use the same colors everywhere in the application: violet for `admin`, amber for `lymphotrack_admin`, and blue for `lymphotrack`.

- **`admin`**: Full application and user administration.
- **`lymphotrack_admin`**: Clinical workflow administration, report/rule controls, and hidden-content management.
- **`lymphotrack`**: Sample analysis, IMGT/V-QUEST submission, and report workflows.

A user may have multiple roles. The API evaluates the roles required by each operation; badge color is visual guidance and does not provide authorization by itself.

## Managing Existing Users

Administrators can perform several actions on existing users by clicking the respective buttons in the table row:

- **Edit Roles:** Add or remove one or more roles.
- **Change Identity:** Moving LDAP to Local requires a new password. Moving Local to LDAP removes the stored local password.
- **Reset Password:** Available only for Local identities. Editing a Local user without entering a new password retains the existing hash.
- **Enable / Disable:** You cannot permanently delete a user (to preserve audit integrity for actions they have taken in the past). Instead, you can toggle their `Disabled` state. A disabled user will be immediately rejected at the login screen.

> [!IMPORTANT]
> There is no default administrator. An initial administrator record must be created or imported directly before the Users interface can be accessed.
