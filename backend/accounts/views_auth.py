from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from .serializers_auth import RegisterSerializer

class RegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "user_id": user.id,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_201_CREATED
        )


# class   LoginAPIView(APIView):
#     permission_classes = [permissions.AllowAny]

#     def post(self, request):
#         username = request.data.get("username")
#         password = request.data.get("password")

#         user = authenticate(username=username, password=password)

#         if not user:
#             return Response({"error": "Invalid credentials"}, status=400)

#         refresh = RefreshToken.for_user(user)

#         return Response({
#             "access": str(refresh.access_token),
#             "refresh": str(refresh)
#         })
