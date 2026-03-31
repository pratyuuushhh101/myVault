from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from accounts.models import User

class AuthTests(APITestCase):
    """
    Standardized API Authentication tests specifically for MyVault.
    Aligns with JWT login/refresh naming conventions.
    """

    def setUp(self):
        self.register_url = reverse("register")
        self.login_url = reverse("jwt-login")
        self.refresh_url = reverse("jwt-refresh")
        
        # FIXED: Using a more generic data structure for test generation
        self.user_data = {
            "username": "alice",
            "email": "alice_primary@test.com",
            "password": "StrongPass123!"
        }

    def test_register_success_provides_tokens(self):
        """FIXED: Registration should automatically provide JWT access/refresh."""
        response = self.client.post(self.register_url, self.user_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_register_duplicate_fails(self):
        User.objects.create_user(**self.user_data)
        response = self.client.post(self.register_url, self.user_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_success(self):
        User.objects.create_user(**self.user_data)
        response = self.client.post(self.login_url, {
            "username": self.user_data["username"],
            "password": self.user_data["password"]
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password_fails(self):
        User.objects.create_user(**self.user_data)
        response = self.client.post(self.login_url, {
            "username": self.user_data["username"],
            "password": "wrongpassword"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_success(self):
        # Unique email for this specific test case
        data = self.user_data.copy()
        data["username"] = "refresh_user"
        data["email"] = "refresh_@test.com"
        User.objects.create_user(**data)
        
        login_response = self.client.post(self.login_url, {
            "username": data["username"],
            "password": data["password"]
        }, format="json")
        
        refresh_token = login_response.data["refresh"]
        response = self.client.post(self.refresh_url, {"refresh": refresh_token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
