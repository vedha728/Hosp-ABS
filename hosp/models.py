
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
    # add other profile fields

    def __str__(self):
        return self.email
    
class Appointment(models.Model):
    patient = models.ForeignKey('Patient', on_delete=models.CASCADE)
    appointment_date = models.DateField()
    appointment_time = models.TimeField(default=datetime.time(9, 0))  # import datetime beforehand
    doctor_name = models.CharField(max_length=100)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=30, default='Pending')
    token_number = models.CharField(max_length=10, blank=True, null=True)  # Add this line
    def __str__(self):
        return f"Appointment for {self.patient.email} on {self.appointment_date} with Dr. {self.doctor_name}"
    
class MedicalRecord(models.Model):
    patient = models.ForeignKey('Patient', on_delete=models.CASCADE)
    file = models.FileField(upload_to='records/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.patient.email} - {self.file.name}"
