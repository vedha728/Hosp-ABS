from rest_framework import serializers
from .models import Patient
from django.contrib.auth.hashers import make_password

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = '__all__'
        extra_kwargs = {
            'password': {'write_only': True}
        }

    def create(self, validated_data):
        # Hash the password before saving the patient instance!
        validated_data['password'] = make_password(validated_data['password'])
        return super().create(validated_data)
