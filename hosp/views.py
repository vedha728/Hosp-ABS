from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .serializers import PatientSerializer
from .models import Patient, Appointment, Feedback
from django.contrib.auth.hashers import check_password
from django.shortcuts import render, redirect
from django.core.mail import send_mail
from django.conf import settings
from django.views.decorators.csrf import csrf_exempt
import threading

def send_email_async(subject, message, recipient_list):
    """Sends an email asynchronously in a background daemon thread."""
    thread = threading.Thread(
        target=send_mail,
        args=(subject, message, settings.DEFAULT_FROM_EMAIL, recipient_list),
        kwargs={'fail_silently': True}
    )
    thread.daemon = True
    thread.start()
from django.http import JsonResponse
from .utils import generate_verification_token, verify_verification_token
from decouple import config
import json
import os
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
    return redirect('/patient_login/?action=signup')


@api_view(['POST'])
def register_patient(request):
    serializer = PatientSerializer(data=request.data)
    if serializer.is_valid():
        # Create patient, marked as unverified (is_verified=False)
        patient = serializer.save(is_verified=False)
        
        # Generate secure email verification token
        token = generate_verification_token(patient.email)
        
        # Build verification URL
        verification_link = request.build_absolute_uri(f'/verify-email/{token}/')
        verification_link = verification_link.replace('127.0.0.1', 'localhost')
        
        # Send verification email to patient
        try:
            subject = 'Verify Your Account - CureWell Hospital'
            message = (
                f'Dear {patient.first_name or "Patient"},\n\n'
                f'Thank you for registering at CureWell Hospital.\n'
                f'Please verify your email address by clicking the link below:\n\n'
                f'{verification_link}\n\n'
                f'This link will expire in 24 hours.\n\n'
                f'Regards,\nCureWell Hospital'
            )
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [patient.email],
                fail_silently=False
            )
            return Response({'message': 'Registration successful! Please check your email to verify your account.'}, status=201)
        except Exception as e:
            # If email fails, roll back patient creation to prevent orphaned unverified accounts
            patient.delete()
            return Response({'error': f'Failed to send verification email: {str(e)}. Please check your email address.'}, status=500)
            
    return Response(serializer.errors, status=400)


@api_view(['POST'])
def login_patient(request):
    email = request.data.get('email')
    password = request.data.get('password')
    try:
        patient = Patient.objects.get(email=email)
        if not patient.is_verified:
            return Response({'error': 'Your email is not verified. Please check your inbox for the verification link.'}, status=403)
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
    
    # Validate age: must be a positive integer between 1 and 120 (inclusive)
    age = request.data.get('age')
    if age is not None and age != '':
        try:
            age_val = int(age)
            if age_val < 1 or age_val > 120:
                return Response({'error': 'Age must be between 1 and 120.'}, status=400)
        except (ValueError, TypeError):
            return Response({'error': 'Age must be a valid positive integer.'}, status=400)

    # Validate mobile: must contain only digits and be between 10 and 15 characters (inclusive)
    mobile = request.data.get('mobile')
    if mobile is not None and mobile != '':
        if not mobile.isdigit():
            return Response({'error': 'Mobile number must contain only digits.'}, status=400)
        if len(mobile) < 10 or len(mobile) > 15:
            return Response({'error': 'Mobile number must be between 10 and 15 digits.'}, status=400)

    # Update fields from request
    for field in ['first_name', 'last_name', 'age', 'blood_group', 'mobile']:
        value = request.data.get(field)
        if value is not None:
            # Convert empty age string to None to avoid database integer conversion issue
            if field == 'age' and value == '':
                value = None
            setattr(patient, field, value)
    patient.save()
    return Response({'message': 'Profile updated successfully.'})


@api_view(['POST'])
def book_appointment(request):
    patient = get_logged_in_patient(request)
    if not patient:
        return Response({'error': 'Not logged in.'}, status=401)
    appointment_date = request.data.get('appointment_date')
    service_name = request.data.get('service_name')
    reason = request.data.get('reason')
    appointment_time = request.data.get('appointment_time')

    if not (appointment_date and appointment_time and service_name):
        return Response({'error': 'Date, time, and service are required.'}, status=400)

    # Server-side check for time slots availability (limit is 3, excluding canceled/rejected ones)
    existing_count = Appointment.objects.filter(
        appointment_date=appointment_date,
        appointment_time=appointment_time,
        service_name=service_name
    ).exclude(status__in=['Canceled', 'Rejected']).count()

    if existing_count >= 3:
        return Response({'error': 'This time slot is fully booked. Please select another slot.'}, status=400)

    appointment = Appointment.objects.create(
        patient=patient,
        appointment_date=appointment_date,
        appointment_time=appointment_time,
        service_name=service_name,
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

def is_logged_in_receptionist(request):
    """Returns True if the receptionist session exists."""
    return 'receptionist_username' in request.session

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
        if passkey == RECEPTIONIST_PASSKEY and username == RECEPTIONIST_USERNAME and password == RECEPTIONIST_PASSWORD:
            # Store receptionist identity in session
            request.session['receptionist_username'] = username
            return JsonResponse({'success': True, 'username': username})
        else:
            return JsonResponse({'error': 'Invalid credentials'}, status=401)
    return JsonResponse({'error': 'Invalid method'}, status=405)
@csrf_exempt
def patient_login_view(request):
    return render(request, 'hosp/patient_login.html')

def verify_email(request, token):
    email = verify_verification_token(token)
    if not email:
        return render(request, 'hosp/verification_result.html', {
            'success': False,
            'message': 'The verification link is invalid or has expired.'
        })
    
    try:
        patient = Patient.objects.get(email=email)
        if patient.is_verified:
            return render(request, 'hosp/verification_result.html', {
                'success': True,
                'message': 'Your email is already verified. You can log in.'
            })
        patient.is_verified = True
        patient.save()
        return render(request, 'hosp/verification_result.html', {
            'success': True,
            'message': 'Your email has been verified successfully! You can now log in.'
        })
    except Patient.DoesNotExist:
        return render(request, 'hosp/verification_result.html', {
            'success': False,
            'message': 'No patient record found for this email.'
        })
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
                    "service": appointment.service_name,
                    "reason": appointment.reason,
                    "date": str(appointment.appointment_date),
                    "time": str(appointment.appointment_time),
                    "status": appointment.status,
                    'token_number': getattr(appointment, 'token_number', None),
                    "rejection_reason": getattr(appointment, 'rejection_reason', "") or "",
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
            service_name=service
        )
        appointment.delete()
        return Response({'message': 'Appointment cancelled.'})
    except Appointment.DoesNotExist:
        return Response({'error': 'Appointment not found.'}, status=404)
    except Exception as e:
        return Response({'error': str(e)}, status=400)
@csrf_exempt
def get_all_appointments(request):
    is_recep = is_logged_in_receptionist(request)
    is_patient = get_logged_in_patient(request) is not None
    if not (is_recep or is_patient):
        return JsonResponse({"error": "Unauthorized access."}, status=401)
    if request.method == "POST":
        try:
            body = json.loads(request.body.decode('utf-8'))
            date_str = body.get("date")
            fetch_all = body.get("all", False)

            if fetch_all:
                if not is_recep:
                    return JsonResponse({"error": "Unauthorized to fetch all appointments."}, status=403)
                appointments = Appointment.objects.all().order_by('appointment_date', 'appointment_time')
            else:
                if not date_str:
                    return JsonResponse({"appointments": []})
                # Parse the string date (e.g., "2025-10-19") to a date object
                try:
                    date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
                except Exception:
                    return JsonResponse({"appointments": [], "error": "Invalid date format. Use YYYY-MM-DD."}, status=400)

                appointments = Appointment.objects.filter(appointment_date=date_obj).order_by('appointment_time')
            output = []
            for app in appointments:
                try:
                    start_time = app.appointment_time  # Should be time object
                    start_dt = datetime.combine(datetime.today(), start_time)
                    end_dt = start_dt + timedelta(hours=1)
                    time_slot = f"{start_dt.strftime('%H:%M')}-{end_dt.strftime('%H:%M')}"
                except Exception:
                    time_slot = str(app.appointment_time)

                item = {
                    "date": str(app.appointment_date),
                    "time": time_slot,
                    "service_name": getattr(app, "service_name", ""),
                    "status": getattr(app, "status", ""),
                    "rejection_reason": getattr(app, "rejection_reason", "") or "",
                }
                if is_recep:
                    item.update({
                        "id": app.id,
                        "reason": getattr(app, "reason", ""),
                        "token_number": getattr(app, "token_number", ""),
                        "patient_id": app.patient.id if getattr(app, "patient", None) else None,
                        "patient_email": app.patient.email if getattr(app, "patient", None) else None
                    })
                output.append(item)
            return JsonResponse({"appointments": output})
        except Exception as e:
            return JsonResponse({"appointments": [], "error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request"}, status=405)

PREFIX_MAP = {
    "General Medicine (General Checkup)": "GEN",
    "Cardiology (Heart Care)": "CAR",
    "Dentistry (Dental Care)": "DEN",
    "Ophthalmology (Eye Care)": "OPH",
    "Orthopedics (Bone & Joint Care)": "ORT",
    "Pediatrics (For Children)": "PED",
    "Dermatology (Skin Care)": "DER",
    "Gynecology (Women's Health)": "GYN",
    "Radiology (X-ray & Scans)": "RAD"
}

@csrf_exempt
def update_appointment_status(request):
    if not is_logged_in_receptionist(request):
        return JsonResponse({"error": "Unauthorized access. Staff login required."}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            appointment_id = data.get('id')
            new_status = data.get('status')
            if not (appointment_id and new_status):
                return JsonResponse({'error': 'Missing id or status'}, status=400)
            app = Appointment.objects.get(id=appointment_id)
            app.status = new_status
            
            # Generate token automatically if confirmed
            if new_status == 'Confirmed' and not app.token_number:
                prefix = PREFIX_MAP.get(app.service_name, "HSP")
                confirmed_count = Appointment.objects.filter(
                    appointment_date=app.appointment_date,
                    service_name=app.service_name,
                    status='Confirmed'
                ).count()
                token_seq = confirmed_count + 1
                app.token_number = f"{prefix}-{token_seq:02d}"
                
            app.save()
            # Send email notification to patient asynchronously
            subject = 'Appointment Confirmed - CureWell Hospital'
            message = (
                f'Dear Patient,\n\n'
                f'Your appointment has been CONFIRMED.\n'
                f'Service: {app.service_name}\n'
                f'Date: {app.appointment_date}\n'
                f'Time: {app.appointment_time}\n'
                f'Your Token Number: {app.token_number}\n\n'
                f'Please arrive 10 minutes before your scheduled time.\n\n'
                f'Regards,\nCureWell Hospital'
            )
            send_email_async(subject, message, [app.patient.email])
            return JsonResponse({'message': f'Appointment status set to {new_status}.', 'token_number': app.token_number})
        except Appointment.DoesNotExist:
            return JsonResponse({'error': 'Appointment not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)
    else:
        return JsonResponse({'error': 'Invalid request method.'}, status=405)

@csrf_exempt
def notify_patient(request):
    if not is_logged_in_receptionist(request):
        return JsonResponse({"error": "Unauthorized access. Staff login required."}, status=401)
    if request.method == 'POST':
        data = json.loads(request.body)
        email = data.get('email')
        message = data.get('message')
        # TODO: persist if you add a Notification model
        return JsonResponse({'ok': True})

@csrf_exempt
def notify_reception(request):
    if not is_logged_in_receptionist(request):
        return JsonResponse({"error": "Unauthorized access. Staff login required."}, status=401)
    if request.method == 'POST':
        data = json.loads(request.body)
        message = data.get('message')
        return JsonResponse({'ok': True})

@csrf_exempt
def receptionist_reject_appointment(request):
    if not is_logged_in_receptionist(request):
        return JsonResponse({"error": "Unauthorized access. Staff login required."}, status=401)
    if request.method == 'POST':
        try:
            data = json.loads(request.body.decode('utf-8'))
            appointment_id = data.get('id')
            rejection_reason = data.get('rejection_reason')
            if not appointment_id:
                return JsonResponse({'error': 'id required'}, status=400)
            if not rejection_reason or not rejection_reason.strip():
                return JsonResponse({'error': 'Rejection reason is required.'}, status=400)
            app = Appointment.objects.get(id=appointment_id)
            app.status = 'Rejected'
            app.rejection_reason = rejection_reason.strip()
            app.save()
            # Send rejection email to patient asynchronously
            subject = 'Appointment Update - CureWell Hospital'
            message = (
                f'Dear Patient,\n\n'
                f'Unfortunately, your appointment has been REJECTED.\n'
                f'Service: {app.service_name}\n'
                f'Date: {app.appointment_date}\n'
                f'Reason for Rejection: {app.rejection_reason}\n\n'
                f'Please contact us or book a new appointment.\n'
                f'Phone: 04373-233666 or +91 8248917874\n\n'
                f'Regards,\nCureWell Hospital'
            )
            send_email_async(subject, message, [app.patient.email])
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
        patient = get_logged_in_patient(request)
        if not patient:
            return JsonResponse({'error': 'Unauthorized. Please log in as a patient to leave feedback.'}, status=401)
            
        try:
            data = json.loads(request.body)
            service_name = data.get('service_name', '').strip()
            feedback_text = data.get('text', '').strip()
            rating = int(data.get('rating', 0))
            if not service_name or not feedback_text or not rating:
                return JsonResponse({'error': 'All fields are required.'}, status=400)
            if not (1 <= rating <= 5):
                return JsonResponse({'error': 'Rating must be between 1 and 5.'}, status=400)
            Feedback.objects.create(
                patient=patient,
                service_name=service_name,
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
                'service_name': f.service_name,
                'text': f.feedback_text,
                'rating': f.rating,
                'submitted_at': f.submitted_at.strftime('%d %b %Y'),
                'patient_name': f"{f.patient.first_name} {f.patient.last_name}".strip() if f.patient and (f.patient.first_name or f.patient.last_name) else (f.patient.email if f.patient else "Anonymous")
            }
            for f in feedbacks
        ]
        return JsonResponse({'feedbacks': data})
    return JsonResponse({'error': 'Invalid method'}, status=405)
