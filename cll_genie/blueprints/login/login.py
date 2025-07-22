"""
Login page routes, login_manager functions, and User class.

This module defines the `User` class for user authentication and authorization,
as well as forms and utilities for managing user login and updates.
"""
from typing import List
from flask_wtf import FlaskForm

from wtforms import (
    StringField,
    PasswordField,
    BooleanField,
    SubmitField,
    EmailField,
    HiddenField,
)
from wtforms.validators import (
    DataRequired,
    EqualTo,
    Length,
    Regexp,
    Email,
    ValidationError,
)
from werkzeug.security import generate_password_hash, check_password_hash
from flask import current_app as cll_app
from cll_genie.extensions import mongo


# User class:
class User:
    """
    Represents a user in the application.

    Attributes:
        username (str): The username of the user.
        groups (List[str]): The groups the user belongs to.
        fullname (str): The full name of the user.
    """
    def __init__(self, username: str, groups: List[str], fullname: str):
        """
        Initialize a User instance.

        Args:
            username (str): The username of the user.
            groups (List[str]): The groups the user belongs to.
            fullname (str): The full name of the user.
        """
        self.username = username
        self.groups = groups
        self.fullname = fullname

    def is_authenticated(self) -> bool:
        """
        Check if the user is authenticated.

        Returns:
            bool: Always True for this implementation.
        """
        return True

    def is_active(self) -> bool:
        """
        Check if the user is active.

        Returns:
            bool: Always True for this implementation.
        """
        return True

    def is_anonymous(self) -> bool:
        """
        Check if the user is anonymous.

        Returns:
            bool: Always False for this implementation.
        """
        return False

    def get_id(self) -> str:
        """
        Get the user's ID.

        Returns:
            str: The username of the user.
        """
        return self.username

    def get_fullname(self) -> str:
        """
        Get the user's full name.

        Returns:
            str: The full name of the user.
        """
        return self.fullname

    def get_groups(self) -> List[str]:
        """
        Get the groups the user belongs to.

        Returns:
            List[str]: A list of group names.
        """
        return self.groups

    def super_user_mode(self) -> bool:
        """
        Check if the user has super user permissions.

        Permissions are defined through user groups listed in
        'CLL_GENIE_SUPER_PERMISSION_GROUPS' in the application configuration.

        Returns:
            bool: True if the user has super user permissions, False otherwise.
        """

        user_groups = self.get_groups()
        permitted_groups = cll_app.config["CLL_GENIE_SUPER_PERMISSION_GROUPS"]
        cll_app.logger.debug(f"User in groups: {user_groups}")
        cll_app.logger.debug(f"Permitted groups: {permitted_groups}")

        permission_granted = False

        for group in user_groups:
            if group in permitted_groups:
                permission_granted = True
                cll_app.logger.info("Permission granted!")
                break

        if not permission_granted:
            cll_app.logger.warning(
                "User is not authorized to modify data based on group policy."
            )

        if cll_app.debug:
            cll_app.logger.debug("DEBUG mode ON. Authorizing sample edit.")
            permission_granted = True

        return permission_granted

    def admin(self) -> bool:
        """
        Check if the user has admin rights.

        Admin rights are granted if the user belongs to the 'admin' or
        'lymphotrack_admin' groups.

        Returns:
            bool: True if the user has admin rights, False otherwise.
        """

        user_groups = self.get_groups()

        admin = False

        if "admin" in user_groups or "lymphotrack_admin" in user_groups:
            admin = True
            cll_app.logger.info("Admin rights granted for the user!")

        else:
            cll_app.logger.warning("Admin rights declined for the user.")

        if cll_app.debug:
            cll_app.logger.debug("DEBUG mode ON. Authorizing sample edit.")
            admin = True

        return admin

    @staticmethod
    def validate_login(password_hash: str, password: str) -> bool:
        """
        Validate a user's login credentials.

        Args:
            password_hash (str): The hashed password stored in the database.
            password (str): The plaintext password provided by the user.

        Returns:
            bool: True if the password matches the hash, False otherwise.
        """
        return check_password_hash(password_hash, password)


# LoginForm
class LoginForm(FlaskForm):
    """
    Represents the login form for user authentication.

    Attributes:
        username (StringField): Field for entering the username.
        password (PasswordField): Field for entering the password.
    """
    username = StringField("Username", validators=[DataRequired()])
    password = PasswordField("Password", validators=[DataRequired()])


class UpdateUser:
    """
    Handles operations related to user management, such as adding, updating, and retrieving user details.

    Attributes:
        user (str): The username of the user.
        password (str): The password of the user.
        groups (list): The groups the user belongs to.
        fullname (str): The full name of the user.
        email (str): The email address of the user.
        users_collection (pymongo.collection.Collection): The MongoDB collection for storing user data.
    """
    def __init__(
        self, user=None, password=None, groups=None, fullname=None, email=None
    ):
        """
        Initialize an UpdateUser instance.

        Args:
            user (str, optional): The username of the user.
            password (str, optional): The password of the user.
            groups (list, optional): The groups the user belongs to.
            fullname (str, optional): The full name of the user.
            email (str, optional): The email address of the user.
        """
        self.user = user
        self.password = password
        self.groups = groups
        self.fullname = fullname
        self.email = email
        self.users_collection = mongo.cx["coyote"]["users"]

    def user_exists(self) -> bool:
        """
        Check if the user exists in the database.

        Returns:
            bool: True if the user exists, False otherwise.
        """
        return self.users_collection.find_one({"_id": self.user}) is not None

    def get_username(self) -> str:
        """
        Get the username of the user.

        Returns:
            str: The username of the user.
        """
        return self.user

    def get_user_data(self) -> dict:
        """
        Retrieve the user's data from the database.

        Returns:
            dict: The user's data.
        """
        return self.users_collection.find_one({"_id": self.user})

    def get_groups(self) -> List[str]:
        """
        Retrieve the groups the user belongs to.

        Returns:
            list: A list of group names.
        """
        return self.users_collection.find_one({"_id": self.user}).get("groups", [])

    def update_user_details(self, form_data: dict) -> bool:
        """
        Update the user's details in the database.

        Args:
            form_data (dict): The form data containing updated user details.

        Returns:
            bool: True if the update was successful, False otherwise.
        """
        user_data = self.get_user_data()
        new_email = form_data.get("email", "")
        new_fullname = form_data.get("fullname", "")
        add_groups = form_data.get("add_groups", "").split(",")
        remove_groups = form_data.get("remove_groups", "").split(",")

        if user_data:
            current_email = user_data.get("email", "")
            current_fullname = user_data.get("fullname", "")
            current_groups = self.get_groups()
            current_groups.extend(add_groups)
            groups = list(set(current_groups))

            for group in remove_groups:
                if group in groups:
                    groups.remove(group)
            self.users_collection.find_one_and_update(
                {"_id": self.user},
                {
                    "$set": {
                        "email": (
                            new_email
                            if new_email != current_email or new_email is not None
                            else current_email
                        ),
                        "fullname": (
                            new_fullname
                            if new_fullname != current_fullname
                            or new_fullname is not None
                            else current_fullname
                        ),
                        "groups": groups,
                    }
                },
            )
            return True
        else:
            return False

    def add_user(self) -> bool:
        """
        Add a new user to the database.

        Returns:
            bool: True if the user was added successfully, False otherwise.
        """
        try:
            self.users_collection.insert_one(
                {
                    "_id": self.user,
                    "password": generate_password_hash(
                        self.password, method="pbkdf2:sha256"
                    ),
                    "groups": self.groups,
                    "fullname": self.fullname,
                    "email": self.email,
                }
            )
            return True
        except:
            return False

    def update_password(self, new_password: str) -> bool:
        """
        Update the user's password.

        Args:
            new_password (str): The new password.

        Returns:
            bool: True if the password was updated successfully, False otherwise.
        """
        try:
            pass_hash = generate_password_hash(new_password, method="pbkdf2:sha256")
            self.users_collection.find_one_and_update(
                {"_id": self.user},
                {
                    "$set": {
                        "password": pass_hash,
                    }
                },
            )
            return True
        except:
            return False

    def update_email(self):
        """
        Update the user's email address.

        Returns:
            bool: True if the email was updated successfully, False otherwise.
        """
        try:
            self.users_collection.find_one_and_update(
                {"_id": self.user},
                {
                    "$set": {
                        "email": self.email,
                    }
                },
            )
            return True
        except:
            return False


def validate_username(form: FlaskForm, field: StringField) -> None:
    """
    Validate if the username already exists in the database.

    Args:
        form (FlaskForm): The form instance.
        field (Field): The field containing the username.

    Raises:
        ValidationError: If the username already exists.
    """
    user_data = UpdateUser(user=field.data)
    user_exists = user_data.user_exists()
    if user_exists:
        raise ValidationError("User already exists. Please choose another username.")


class UserForm(FlaskForm):
    """
    Represents a user form with enhanced password and email validation.

    Attributes:
        username (StringField): Field for entering the username.
        email (StringField): Field for entering the email address.
        password (PasswordField): Field for entering the password.
        confirm_password (PasswordField): Field for confirming the password.
        fullname (StringField): Field for entering the full name.
        lymphotrack (BooleanField): Checkbox for lymphotrack access.
        lymphotrack_admin (BooleanField): Checkbox for lymphotrack admin access.
    """

    username = StringField(
        "User Name",
        validators=[
            DataRequired(message="User Name is required."),
            validate_username,
        ],
    )

    email = StringField(
        "Email",
        validators=[
            DataRequired(message="Email is required."),
            Email(message="Invalid email address."),
        ],
    )

    password = PasswordField(
        "Password",
        validators=[
            DataRequired(message="Password is required."),
            Length(min=8, message="Password must be at least 8 characters long."),
            Regexp(
                r"^.*(?=.*\d)(?=.*[a-zA-Z]).*$",
                message="Password must contain both letters and numbers.",
            ),
            EqualTo("confirm_password", message="Passwords must match."),
        ],
    )

    confirm_password = PasswordField(
        "Confirm Password",
        validators=[DataRequired(message="Please confirm your password.")],
    )

    fullname = StringField(
        "Full Name", validators=[DataRequired(message="Full Name is required.")]
    )

    lymphotrack = BooleanField("lymphotrack")
    lymphotrack_admin = BooleanField("lymphotrack_admin")


class SearchUserForm(FlaskForm):
    """
    Represents a form for searching users.

    Attributes:
        username (StringField): Field for entering the username to search.
        submit (SubmitField): Submit button for the form.
    """
    username = StringField("Username", validators=[DataRequired()])
    submit = SubmitField("Search")


class EditUserForm(FlaskForm):
    """
    Represents a form for editing user details.

    Attributes:
        user_id (HiddenField): Hidden field for the user ID.
        fullname (StringField): Field for entering the full name.
        email (EmailField): Field for entering the email address.
        groups (StringField): Field for displaying current groups.
        add_groups (StringField): Field for adding groups (comma-separated).
        remove_groups (StringField): Field for removing groups (comma-separated).
        save (SubmitField): Submit button for saving changes.
    """
    user_id = HiddenField("User ID")
    fullname = StringField("Full Name", validators=[DataRequired()])
    email = EmailField("Email", validators=[DataRequired()])
    groups = StringField("Current Groups")
    add_groups = StringField("Add Groups (comma separated)")
    remove_groups = StringField("Remove Groups (comma separated)")
    save = SubmitField("Save Changes", render_kw={"class": "btn btn-primary"})
