from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .serializers import PatientSerializer
from .models import MedicalRecord, Patient
from django.contrib.auth.hashers import check_password
from django.shortcuts import render
from django.core.mail import send_mail
from django.conf import settings
from .utils import generate_verification_token
from .utils import verify_verification_token
from .models import Appointment
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse

def home(request):
    return render(request, 'hosp/index.html')

def register(request):
    return render(request, 'hosp/register.html')


@api_view(['POST'])
def register_patient(request):
    serializer = PatientSerializer(data=request.data)
    if serializer.is_valid():
        # Create patient and mark as verified immediately
        patient = serializer.save(is_verified=True)
        return Response({'message': 'Registration successful! You can now log in.'}, status=201)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
def login_patient(request):
    email = request.data.get('email')
    password = request.data.get('password')
    try:
        patient = Patient.objects.get(email=email)
        if check_password(password, patient.password):
            serializer = PatientSerializer(patient)
            return Response(serializer.data)
        else:
            return Response({'error': 'Invalid credentials'}, status=401)
    except Patient.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    

@api_view(['POST'])
def update_patient_profile(request):
    email = request.data.get('email')
    try:
        patient = Patient.objects.get(email=email)
        # Update fields from request
        for field in ['first_name', 'last_name', 'age', 'blood_group', 'mobile']:
            value = request.data.get(field)
            if value is not None:
                setattr(patient, field, value)
        patient.save()
        return Response({'message': 'Profile updated successfully.'})
    except Patient.DoesNotExist:
        return Response({'error': 'Patient not found.'}, status=404)


@api_view(['POST'])
def book_appointment(request):
    email = request.data.get('email')
    appointment_date = request.data.get('appointment_date')
    doctor_name = request.data.get('doctor_name')
    reason = request.data.get('reason')
    appointment_time=request.data.get('appointment_time')
    try:
        patient = Patient.objects.get(email=email)
        appointment = Appointment.objects.create(
            patient=patient,
            appointment_date=appointment_date,
            appointment_time=appointment_time,
            doctor_name=doctor_name,
            reason=reason,
            status='Pending'
        )
        return Response({'message': 'Appointment booked successfully.'})
    except Patient.DoesNotExist:
        return Response({'error': 'Patient not found.'}, status=404)

@api_view(['POST'])
def get_patient_profile(request):
    email = request.data.get('email')
    try:
        patient = Patient.objects.get(email=email)
        data = {
            'first_name': patient.first_name,
            'last_name': patient.last_name,
            'age': patient.age,
            'blood_group': patient.blood_group,
            'mobile': patient.mobile,
        }
        return Response(data, status=200)
    except Patient.DoesNotExist:
        return Response({'error': 'Patient not found'}, status=404)

MAX_UPLOAD_SIZE = 1 * 1024 * 1024  # 1MB in bytes
@api_view(['POST'])
def upload_medical_record(request):
    file = request.FILES.get('file')
    email = request.POST.get('email')

    if not email:
        return Response({'error': 'Email not provided'}, status=400)

    try:
        patient = Patient.objects.get(email=email)
    except Patient.DoesNotExist:
        return Response({'error': 'Patient not found'}, status=404)

    if not file:
        return Response({'error': 'No file received'}, status=400)
    if file.size > MAX_UPLOAD_SIZE:
        return Response({'error': 'File size exceeds 1MB limit.'}, status=400)
    MedicalRecord.objects.create(patient=patient, file=file)
    return Response({'message': 'File uploaded successfully.'})

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json

@csrf_exempt
def login_receptionist(request):
    if request.method == "POST":
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
        passkey = data.get('passkey')
        # Replace with your real receptionist credential validation!
        if passkey == "7874" and username == "admin" and password == "admin123":
            # return whatever info you want to store for the receptionist session
            return JsonResponse({'success': True, 'username': username})
        else:
            return JsonResponse({'error': 'Invalid credentials'}, status=401)
    return JsonResponse({'error': 'Invalid method'}, status=405)
@csrf_exempt
def patient_login_view(request):
    return render(request, 'hosp/patient_login.html')
@csrf_exempt
def recep_login_view(request):
    return render(request, 'hosp/recep_login.html')

from django.http import JsonResponse
from .models import Appointment
from django.views.decorators.csrf import csrf_exempt
import json

@csrf_exempt
def get_appointments(request):
    if request.method == "POST":
        try:
            if not request.body:
                return JsonResponse({"error": "Empty request body"}, status=400)
            data = json.loads(request.body.decode('utf-8'))
            email = data.get("email")
            if not email:
                return JsonResponse({"error": "No email provided"}, status=400)
            # Fetch appointments for this patient
            appointments_qs = Appointment.objects.filter(patient__email=email)
            appointments = []
            for appointment in appointments_qs:
                appointments.append({
                    "service": appointment.doctor_name,   # doctor_name in your model
                    "reason": appointment.reason,
                    "date": str(appointment.appointment_date),
                    "time": str(appointment.appointment_time),
                    "status": appointment.status,
                    'token_number': getattr(appointment, 'token_number', None),  # If you add this field

                    # Optional: "tokenNumber": None,
                })
            return JsonResponse({"appointments": appointments})
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
    else:
        return JsonResponse({"error": "Invalid method"}, status=405)

from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Appointment, Patient

@api_view(['POST'])
def cancel_appointment(request):
    email = request.data.get('email')
    date = request.data.get('date')
    time = request.data.get('time')
    service = request.data.get('service')
    try:
        patient = Patient.objects.get(email=email)
        # Find the matching appointment
        appointment = Appointment.objects.get(
            patient=patient,
            appointment_date=date,
            appointment_time=time,
            doctor_name=service
        )
        appointment.delete()
        return Response({'message': 'Appointment cancelled.'})
    except Appointment.DoesNotExist:
        return Response({'error': 'Appointment not found.'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=400)
from datetime import datetime, timedelta

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
from datetime import datetime, timedelta
from .models import Appointment

@csrf_exempt
def get_all_appointments(request):
    if request.method == "POST":
        try:
            body = json.loads(request.body.decode('utf-8'))
            date_str = body.get("date")
            if not date_str:
                return JsonResponse({"appointments": []})
            # Parse the string date (e.g., "2025-10-19") to a date object
            try:
                date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
            except Exception:
                return JsonResponse({"appointments": [], "error": "Invalid date format. Use YYYY-MM-DD."}, status=400)

            appointments = Appointment.objects.filter(appointment_date=date_obj)
            output = []
            for app in appointments:
                try:
                    start_time = app.appointment_time  # Should be time object
                    start_dt = datetime.combine(datetime.today(), start_time)
                    end_dt = start_dt + timedelta(hours=1)
                    time_slot = f"{start_dt.strftime('%H:%M')}-{end_dt.strftime('%H:%M')}"
                except Exception:
                    time_slot = str(app.appointment_time)

                output.append({
                    "id": app.id, # add this line
                    "date": str(app.appointment_date),
                    "time": time_slot,
                    "doctor": getattr(app, "doctor_name", ""),
                    "reason": getattr(app, "reason", ""),
                    "status": getattr(app, "status", ""),
                    "token_number": getattr(app, "token_number", ""),
                    "patient_id": app.patient.id if getattr(app, "patient", None) else None,
                    "patient_email": app.patient.email if getattr(app, "patient", None) else None
                })
            return JsonResponse({"appointments": output})
        except Exception as e:
            return JsonResponse({"appointments": [], "error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request"}, status=405)

from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
import json
from .models import Appointment

@csrf_exempt
def update_appointment_status(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            appointment_id = data.get('id')
            new_status = data.get('status')
            token_number = data.get('token_number')  # New
            if not (appointment_id and new_status):
                return JsonResponse({'error': 'Missing id or status'}, status=400)
            app = Appointment.objects.get(id=appointment_id)
            app.status = new_status
            if token_number:
                app.token_number = token_number    # This line updates and stores token number
            app.save()
            return JsonResponse({'message': f'Appointment status set to {new_status}.'})
        except Appointment.DoesNotExist:
            return JsonResponse({'error': 'Appointment not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    else:
        return JsonResponse({'error': 'Invalid request method.'}, status=405)

@csrf_exempt
def notify_patient(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        email = data.get('email')
        message = data.get('message')
        # TODO: persist if you add a Notification model
        return JsonResponse({'ok': True})

@csrf_exempt
def notify_reception(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        message = data.get('message')
        return JsonResponse({'ok': True})
    
@csrf_exempt
def receptionist_reject_appointment(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body.decode('utf-8'))
            appointment_id = data.get('id')
            if not appointment_id:
                return JsonResponse({'error': 'id required'}, status=400)

            app = Appointment.objects.get(id=appointment_id)
            app.status = 'Rejected'
            app.save()
            return JsonResponse({'message': 'Appointment rejected.'})
        except Appointment.DoesNotExist:
            return JsonResponse({'error': 'Appointment not found.'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method'}, status=405)
