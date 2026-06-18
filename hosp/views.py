from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .serializers import PatientSerializer
from .models import MedicalRecord, Patient, Appointment, Feedback
from django.contrib.auth.hashers import check_password
from django.shortcuts import render
from django.core.mail import send_mail
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from .utils import generate_verification_token, verify_verification_token
from decouple import config
import json
from datetime import datetime, timedelta

# --- Session Auth Helper ---
def get_logged_in_patient(request):
    """Returns the Patient object for the currently logged-in patient,
    or None if no patient session exists."""
    email = request.session.get('patient_email')
    if not email:
        return None
    try:
        return Patient.objects.get(email=email)
    except Patient.DoesNotExist:
        return None

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
            # Store patient identity in server-side session
            request.session['patient_email'] = patient.email
            serializer = PatientSerializer(patient)
            return Response(serializer.data)
        else:
            return Response({'error': 'Invalid credentials'}, status=401)
    except Patient.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)


@csrf_exempt
def logout_patient(request):
    """Clears the patient session — proper server-side logout."""
    if request.method == 'POST':
        request.session.flush()
        return JsonResponse({'message': 'Logged out successfully.'})
    return JsonResponse({'error': 'Invalid method'}, status=405)


@api_view(['POST'])
def update_patient_profile(request):
    patient = get_logged_in_patient(request)
    if not patient:
        return Response({'error': 'Not logged in.'}, status=401)
    # Update fields from request
    for field in ['first_name', 'last_name', 'age', 'blood_group', 'mobile']:
        value = request.data.get(field)
        if value is not None:
            setattr(patient, field, value)
    patient.save()
    return Response({'message': 'Profile updated successfully.'})


@api_view(['POST'])
def book_appointment(request):
    patient = get_logged_in_patient(request)
    if not patient:
        return Response({'error': 'Not logged in.'}, status=401)
    appointment_date = request.data.get('appointment_date')
    doctor_name = request.data.get('doctor_name')
    reason = request.data.get('reason')
    appointment_time = request.data.get('appointment_time')
    appointment = Appointment.objects.create(
        patient=patient,
        appointment_date=appointment_date,
        appointment_time=appointment_time,
        doctor_name=doctor_name,
        reason=reason,
        status='Pending'
    )
    return Response({'message': 'Appointment booked successfully.'})

@api_view(['POST'])
def get_patient_profile(request):
    patient = get_logged_in_patient(request)
    if not patient:
        return Response({'error': 'Not logged in.'}, status=401)
    data = {
        'first_name': patient.first_name,
        'last_name': patient.last_name,
        'age': patient.age,
        'blood_group': patient.blood_group,
        'mobile': patient.mobile,
    }
    return Response(data, status=200)

MAX_UPLOAD_SIZE = 1 * 1024 * 1024  # 1MB in bytes
@api_view(['POST'])
def upload_medical_record(request):
    patient = get_logged_in_patient(request)
    if not patient:
        return Response({'error': 'Not logged in.'}, status=401)
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'No file received'}, status=400)
    if file.size > MAX_UPLOAD_SIZE:
        return Response({'error': 'File size exceeds 1MB limit.'}, status=400)
    MedicalRecord.objects.create(patient=patient, file=file)
    return Response({'message': 'File uploaded successfully.'})

@csrf_exempt
def login_receptionist(request):
    if request.method == "POST":
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
        passkey = data.get('passkey')
        # Replace with your real receptionist credential validation!
        RECEPTIONIST_PASSKEY = config('RECEPTIONIST_PASSKEY')
        RECEPTIONIST_USERNAME = config('RECEPTIONIST_USERNAME')
        RECEPTIONIST_PASSWORD = config('RECEPTIONIST_PASSWORD')
        if passkey == RECEPTIONIST_PASSKEY and username == RECEPTIONIST_USERNAME and password == RECEPTIONIST_PASSWORD:            # return whatever info you want to store for the receptionist session
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

@csrf_exempt
def get_appointments(request):
    if request.method == "POST":
        try:
            # Read patient identity from session — not from request body
            email = request.session.get('patient_email')
            if not email:
                return JsonResponse({"error": "Not logged in."}, status=401)
            # Fetch appointments for this patient
            appointments_qs = Appointment.objects.filter(patient__email=email)
            appointments = []
            for appointment in appointments_qs:
                appointments.append({
                    "service": appointment.doctor_name,
                    "reason": appointment.reason,
                    "date": str(appointment.appointment_date),
                    "time": str(appointment.appointment_time),
                    "status": appointment.status,
                    'token_number': getattr(appointment, 'token_number', None),
                })
            return JsonResponse({"appointments": appointments})
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)
    else:
        return JsonResponse({"error": "Invalid method"}, status=405)

@api_view(['POST'])
def cancel_appointment(request):
    patient = get_logged_in_patient(request)
    if not patient:
        return Response({'error': 'Not logged in.'}, status=401)
    date = request.data.get('date')
    time = request.data.get('time')
    service = request.data.get('service')
    try:
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

@csrf_exempt
def update_appointment_status(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            appointment_id = data.get('id')
            new_status = data.get('status')
            token_number = data.get('token_number')
            if not (appointment_id and new_status):
                return JsonResponse({'error': 'Missing id or status'}, status=400)
            app = Appointment.objects.get(id=appointment_id)
            app.status = new_status
            if token_number:
                app.token_number = token_number
            app.save()
            # Send email notification to patient
            try:
                subject = 'Appointment Confirmed - HealthPoint Clinic'
                message = (
                    f'Dear Patient,\n\n'
                    f'Your appointment has been CONFIRMED.\n'
                    f'Service: {app.doctor_name}\n'
                    f'Date: {app.appointment_date}\n'
                    f'Time: {app.appointment_time}\n'
                    f'Your Token Number: {token_number or "Will be assigned"}\n\n'
                    f'Please arrive 10 minutes before your scheduled time.\n\n'
                    f'Regards,\nHealthPoint Clinic'
                )
                send_mail(subject, message, settings.DEFAULT_FROM_EMAIL,
                          [app.patient.email], fail_silently=True)
            except Exception:
                pass  # Don't crash if email fails
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
            # Send rejection email to patient
            try:
                subject = 'Appointment Update - HealthPoint Clinic'
                message = (
                    f'Dear Patient,\n\n'
                    f'Unfortunately, your appointment has been REJECTED.\n'
                    f'Service: {app.doctor_name}\n'
                    f'Date: {app.appointment_date}\n\n'
                    f'Please contact us or book a new appointment.\n'
                    f'Phone: +91 85478 96547\n\n'
                    f'Regards,\nHealthPoint Clinic'
                )
                send_mail(subject, message, settings.DEFAULT_FROM_EMAIL,
                          [app.patient.email], fail_silently=True)
            except Exception:
                pass  # Don't crash if email fails
            return JsonResponse({'message': 'Appointment rejected.'})
        except Appointment.DoesNotExist:
            return JsonResponse({'error': 'Appointment not found.'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method'}, status=405)

# --- Feedback Views ---
@csrf_exempt
def save_feedback(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            doctor_or_service = data.get('doctor', '').strip()
            feedback_text = data.get('text', '').strip()
            rating = int(data.get('rating', 0))
            if not doctor_or_service or not feedback_text or not rating:
                return JsonResponse({'error': 'All fields are required.'}, status=400)
            if not (1 <= rating <= 5):
                return JsonResponse({'error': 'Rating must be between 1 and 5.'}, status=400)
            Feedback.objects.create(
                doctor_or_service=doctor_or_service,
                feedback_text=feedback_text,
                rating=rating
            )
            return JsonResponse({'message': 'Thank you for your feedback!'})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    return JsonResponse({'error': 'Invalid method'}, status=405)

@csrf_exempt
def get_feedbacks(request):
    if request.method == 'GET':
        feedbacks = Feedback.objects.order_by('-submitted_at')[:20]  # Latest 20
        data = [
            {
                'doctor': f.doctor_or_service,
                'text': f.feedback_text,
                'rating': f.rating,
                'submitted_at': f.submitted_at.strftime('%d %b %Y')
            }
            for f in feedbacks
        ]
        return JsonResponse({'feedbacks': data})
    return JsonResponse({'error': 'Invalid method'}, status=405)
