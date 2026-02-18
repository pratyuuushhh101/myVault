from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework import status
from accounts.models import User

class AuthTests(APITestCase):

    def setUp(self):
        self.register_url = reverse("register")
        self.login_url = reverse("jwt-login")
        self.refresh_url = reverse("jwt-refresh")
        self.user_data = {
            "username": "alice",
            "email": "alice@test.com",
            "password": "StrongPass123!"
        }

    def test_register_success(self):
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
            "username": "alice",
            "password": "StrongPass123!"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_wrong_password_fails(self):
        User.objects.create_user(**self.user_data)
        response = self.client.post(self.login_url, {
            "username": "alice",
            "password": "wrongpass"
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_success(self):
        user = User.objects.create_user(**self.user_data)
        login_response = self.client.post(self.login_url, {
            "username": "alice",
            "password": "StrongPass123!"
        }, format="json")
        refresh_token = login_response.data["refresh"]
        response = self.client.post(self.refresh_url, {"refresh": refresh_token}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
