# 9. User Management

CLL Genie implements a clean Role-Based Access Control (RBAC) system. Administrators can manage who has access to the application and what actions they can perform.

## The Users Interface

To access User Management, you must be logged in as an Administrator. Navigate to **Admin > Users** from the sidebar.

Here you will see a table of all registered users with their:
- **Username**
- **Email**
- **Role** (`user`, `admin`, or `lymphotrack_admin`)
- **Status** (Enabled / Disabled)

## Adding a New User

1. Click **"Add User"** in the top right.
2. Fill in the **Username** and **Email**.
3. Provide a **Password**. (The user can change this later).
4. Select the appropriate **Role**.

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

> [!WARNING]
> **Default Admin Account:** Remember to change the password of the default `admin` account (or disable it entirely after creating your own personal admin account) to secure your deployment!
