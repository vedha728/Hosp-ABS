from django.test import TestCase
from django.urls import reverse
from django.conf import settings
from .models import Patient, Appointment

class HMSSafeguardsTestCase(TestCase):
    def setUp(self):
        # Create a verified patient for testing
        self.patient = Patient.objects.create(
            email="testpatient@example.com",
            password="pbkdf2_sha256$870000$somehashpassword...",  # dummy hash
            first_name="John",
            last_name="Doe",
            age=30,
            mobile="1234567890",
            is_verified=True
        )
        # Set session variable for patient auth
        session = self.client.session
        session['patient_email'] = self.patient.email
        session.save()

    def test_session_settings(self):
        # Verify inactivity-based session settings
        self.assertEqual(settings.SESSION_COOKIE_AGE, 1800)
        self.assertTrue(settings.SESSION_SAVE_EVERY_REQUEST)

    def test_profile_update_age_validation(self):
        url = reverse('update_profile')
        
        # Valid age
        response = self.client.post(url, {'age': '45'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.age, 45)

        # Invalid age: less than 1
        response = self.client.post(url, {'age': '0'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

        # Invalid age: greater than 120
        response = self.client.post(url, {'age': '121'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

        # Invalid age: non-integer
        response = self.client.post(url, {'age': 'abc'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

        # Empty age should be allowed (convert to None)
        response = self.client.post(url, {'age': ''}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertIsNone(self.patient.age)

    def test_profile_update_mobile_validation(self):
        url = reverse('update_profile')

        # Valid mobile: 10 digits
        response = self.client.post(url, {'mobile': '0987654321'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.mobile, '0987654321')

        # Valid mobile: 15 digits
        response = self.client.post(url, {'mobile': '123456789012345'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.mobile, '123456789012345')

        # Invalid mobile: contains letters
        response = self.client.post(url, {'mobile': '12345abc90'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

        # Invalid mobile: too short (9 digits)
        response = self.client.post(url, {'mobile': '123456789'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

        # Invalid mobile: too long (16 digits)
        response = self.client.post(url, {'mobile': '1234567890123456'}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())


    def test_registration_validation(self):
        url = reverse('api_register')

        # Invalid age: less than 1
        data = {
            'email': 'newpatient@example.com',
            'password': 'Password123!',
            'first_name': 'Alice',
            'last_name': 'Smith',
            'age': 0,
            'mobile': '1234567890'
        }
        response = self.client.post(url, data, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('age', response.json())

        # Invalid mobile: non-digit
        data['age'] = 25
        data['mobile'] = '12345abc90'
        response = self.client.post(url, data, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('mobile', response.json())

        # Valid registration data
        data['mobile'] = '1234567890'
        response = self.client.post(url, data, content_type='application/json')
        self.assertEqual(response.status_code, 201)

    def test_automated_token_generation(self):
        # Create a pending appointment for Cardiology
        app = Appointment.objects.create(
            patient=self.patient,
            appointment_date="2026-06-25",
            appointment_time="10:00:00",
            service_name="Cardiology (Heart Care)",
            status="Pending"
        )
        
        # Confirm it via the update_appointment_status API
        # We need to simulate receptionist login in session
        session = self.client.session
        session['receptionist_username'] = 'admin'
        session.save()

        url = reverse('update_appointment_status')
        payload = {
            'id': app.id,
            'status': 'Confirmed'
        }
        response = self.client.post(url, payload, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['token_number'], 'CAR-01')

        # Check DB
        app.refresh_from_db()
        self.assertEqual(app.token_number, 'CAR-01')

        # Create another appointment for the same department on the same date
        app2 = Appointment.objects.create(
            patient=self.patient,
            appointment_date="2026-06-25",
            appointment_time="11:00:00",
            service_name="Cardiology (Heart Care)",
            status="Pending"
        )
        payload['id'] = app2.id
        response = self.client.post(url, payload, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['token_number'], 'CAR-02')
        app2.refresh_from_db()
        self.assertEqual(app2.token_number, 'CAR-02')

    def test_department_slot_availability_and_limits(self):
        # 1. Create three appointments for Cardiology on 2026-06-20 at 11:00 AM – 12:00 PM (slot "11:00-12:00")
        for i in range(3):
            Appointment.objects.create(
                patient=self.patient,
                appointment_date="2026-06-20",
                appointment_time="11:00-12:00",
                service_name="Cardiology (Heart Care)",
                status="Pending"
            )

        # 2. Try to book a 4th Cardiology appointment for the same slot. Should fail with 400.
        url_book = reverse('book_appointment')
        payload_fail = {
            'appointment_date': '2026-06-20',
            'appointment_time': '11:00-12:00',
            'service_name': 'Cardiology (Heart Care)',
            'reason': 'Routine cardiology checkup'
        }
        response = self.client.post(url_book, payload_fail, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

        # 3. Try to book a 4th appointment for a different department (e.g. Dentistry (Dental Care)) at the same slot. Should succeed (200).
        payload_success = {
            'appointment_date': '2026-06-20',
            'appointment_time': '11:00-12:00',
            'service_name': 'Dentistry (Dental Care)',
            'reason': 'Routine dental checkup'
        }
        response = self.client.post(url_book, payload_success, content_type='application/json')
        self.assertEqual(response.status_code, 200)

        # 4. Check if patient can call get_all_appointments securely and receive anonymized output
        url_get_all = reverse('get_all_appointments')
        response = self.client.post(url_get_all, {'date': '2026-06-20'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('appointments', data)
        # Ensure sensitive details are not present for patient session queries
        for app in data['appointments']:
            self.assertNotIn('patient_email', app)
            self.assertNotIn('reason', app)
            self.assertNotIn('token_number', app)
            self.assertIn('date', app)
            self.assertIn('time', app)
            self.assertIn('service_name', app)

    def test_mandatory_rejection_reason(self):
        # 1. Create a pending appointment
        app = Appointment.objects.create(
            patient=self.patient,
            appointment_date="2026-06-25",
            appointment_time="10:00:00",
            service_name="Cardiology (Heart Care)",
            status="Pending"
        )

        # Log in receptionist
        session = self.client.session
        session['receptionist_username'] = 'admin'
        session.save()

        url_reject = reverse('receptionist_reject')

        # 2. Try to reject without reason. Should fail with 400.
        response = self.client.post(url_reject, {'id': app.id}, content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

        # 3. Try to reject with empty space reason. Should fail with 400.
        response = self.client.post(url_reject, {'id': app.id, 'rejection_reason': '   '}, content_type='application/json')
        self.assertEqual(response.status_code, 400)

        # 4. Reject with valid reason. Should succeed (200) and update DB.
        reason_text = "Doctor is unavailable on this day."
        response = self.client.post(url_reject, {'id': app.id, 'rejection_reason': reason_text}, content_type='application/json')
        self.assertEqual(response.status_code, 200)

        app.refresh_from_db()
        self.assertEqual(app.status, 'Rejected')
        self.assertEqual(app.rejection_reason, reason_text)
