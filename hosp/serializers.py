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

    def validate_age(self, value):
        if value is not None:
            if value < 1 or value > 120:
                raise serializers.ValidationError("Age must be between 1 and 120.")
        return value

    def validate_mobile(self, value):
        if value:
            if not value.isdigit():
                raise serializers.ValidationError("Mobile number must contain only digits.")
            if len(value) < 10 or len(value) > 15:
                raise serializers.ValidationError("Mobile number must be between 10 and 15 digits.")
        return value

    def create(self, validated_data):
        # Hash the password before saving the patient instance!
        validated_data['password'] = make_password(validated_data['password'])
        return super().create(validated_data)
