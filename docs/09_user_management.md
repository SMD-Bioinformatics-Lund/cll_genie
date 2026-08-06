# 9. User Management

CLL Genie has three application roles. An account can have one or more roles, and its permissions are the combination of all assigned roles. Only an account with `admin` can manage users or application configuration.

## The Users Interface

To access User Management, you must be logged in as an Administrator. Navigate to **Admin > Users** from the sidebar.

The page uses server-side search and pagination. Search covers username, full name, email, assigned roles, and allowed login methods.

Here you will see a table of all registered users with their:

- **Username**
- **Email**
- **Login methods** (`LDAP`, `Local`, or both)
- **Last login** (UTC timestamp of the most recent successful authentication)
- **Roles** (one or more of `admin`, `lymphotrack_admin`, and `user`)
- **Status** (Enabled / Disabled)

## User Document Schema

Users are stored in `APPLICATION_DATABASE.USERS_COLLECTION`. MongoDB generates `_id` as an `ObjectId`; application login and updates use the unique `username` and `email` fields.

CLL Genie reads users only from the configured `APPLICATION_DATABASE.USERS_COLLECTION`. To reuse profiles stored in another database, import them before deployment cutover. Session records are database-specific and are not transferable between deployments.

Before creating indexes on an imported database, check for duplicate usernames and email addresses:

```bash
docker compose exec api python -m cll_genie_api.scripts.check_user_integrity
```

The command reports conflicting user documents and exits with a non-zero status when cleanup is required. It does not delete, merge, or rewrite records. Resolve duplicates manually, then run index creation.

```javascript
{
  _id: ObjectId("5f7e1c8b8f8c8b8f8c8b8f8c"),
  username: "example-user",
  allowed_login_methods: ["ldap", "local"],
  fullname: "Example User",
  firstname: "Example",
  lastname: "User",
  email: "example.user@example.org",
  roles: ["user", "lymphotrack_admin"],
  enabled: true,
  last_login: ISODate("2026-07-01T12:00:00Z"),
  created_at: ISODate("2026-01-01T12:00:00Z"),
  updated_at: ISODate("2026-01-01T12:00:00Z"),
  created_by: "system",
  updated_by: "system"
}
```

Records that allow `local` login additionally contain a Werkzeug `password` hash. `allowed_login_methods` must explicitly contain `ldap`, `local`, or both. LDAP remains the primary option in the login interface. Authorization and audit attribution always come from this local profile, including for LDAP authentication.

`last_login` is `null` until the first successful authentication. Each successful LDAP or local login replaces it with a timezone-aware UTC datetime. Failed authentication attempts do not modify the field.

There is no runtime inference from password fields or older identity fields. Before upgrading an existing installation, add `allowed_login_methods` to every user record. Review each account and choose `ldap`, `local`, or both; the application cannot determine the intended policy from an existing password hash.

## Adding a New User

1. Click **"Add User"** in the top right.
2. Select one or both login methods. LDAP is primary and selected by default.
3. Fill in the username, name, and email fields. An LDAP email must match the directory account.
4. Select one or more application roles.
5. When local login is enabled, enter and confirm a password of at least eight characters.
6. Choose the enabled state and create the account.

### Understanding Roles

Role badges use the same colors everywhere in the application: violet for `admin`, amber for `lymphotrack_admin`, and blue for `user`.

- **`admin`**: Full access to the application. This includes all clinical workflow permissions plus audit logs, users, report rules, raw sample JSON editing, and application management.
- **`lymphotrack_admin`**: Normal clinical workflow access plus deletion of samples and submissions, and hiding or restoring comments and reports. This role cannot view audit logs, manage users, edit report rules, or access other management pages.
- **`user`**: Normal worklist access, sample review, workbook/QC upload, sequence selection, IMGT/V-QUEST submission, comments, report previews, and report creation. This role cannot perform clinical moderation or application management.

Roles are additive. For example, assigning both `user` and `lymphotrack_admin` provides the normal workflow and clinical moderation permissions, but not application management. The presence of `admin` grants full access, so additional roles on an administrator account are allowed but do not add permissions. API authorization is enforced independently of the interface, so hiding a menu item is not the security boundary.

## Managing Existing Users

Administrators can perform several actions on existing users by clicking the respective buttons in the table row:

- **Change roles:** Add or remove roles. Every account must retain at least one supported role.
- **Change login methods:** Enabling Local requires a password. Disabling Local removes the stored local password.
- **Reset Password:** Available when Local login is enabled. Leaving the password fields empty retains the existing hash.
- **Enable / Disable:** You cannot permanently delete a user (to preserve audit integrity for actions they have taken in the past). Instead, you can toggle their `Disabled` state. A disabled user will be immediately rejected at the login screen.

> [!IMPORTANT]
> There is no default administrator. An initial administrator record must be created or imported directly before the Users interface can be accessed.

Existing version 1 records using the obsolete `lymphotrack` role must be changed to `user` before login to the version 2 workflow.
