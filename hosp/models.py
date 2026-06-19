# Create your models here.
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager
import datetime

class Patient(models.Model):
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=256)  # Store hashed passwords
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    age = models.IntegerField(null=True, blank=True)
    blood_group = models.CharField(max_length=10, blank=True)
    mobile = models.CharField(max_length=15, blank=True)
    is_verified = models.BooleanField(default=False)  

    def __str__(self):
        return self.email
    
class Appointment(models.Model):
    patient = models.ForeignKey('Patient', on_delete=models.CASCADE)
    appointment_date = models.DateField()
    appointment_time = models.TimeField(default=datetime.time(9, 0))
    service_name = models.CharField(max_length=100)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=30, default='Pending')
    token_number = models.CharField(max_length=10, blank=True, null=True)
    rejection_reason = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Appointment for {self.patient.email} on {self.appointment_date} ({self.service_name})"

class Feedback(models.Model):
    patient = models.ForeignKey('Patient', on_delete=models.CASCADE, null=True, blank=True)
    service_name = models.CharField(max_length=100)
    feedback_text = models.TextField()
    rating = models.IntegerField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.service_name} - {self.rating}/5 stars"
