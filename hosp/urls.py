from django.urls import path
from . import views
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Template rendering views (for browser navigation)
    path('', views.home, name='home'),  # /
    path('register/', views.register, name='register'),

    # API endpoints (for AJAX/fetch)
    path('api/register/', views.register_patient, name='api_register'),
    path('api/login/', views.login_patient, name='api_login'),
    path('api/update-profile/', views.update_patient_profile, name='update_profile'),
    path('api/get-profile/', views.get_patient_profile, name='get_profile'),
    path('api/upload-medical-record/', views.upload_medical_record, name='upload_medical_record'),  # New
    path('api/book-appointment/', views.book_appointment, name='book_appointment'),
    path('api/reception-login/', views.login_receptionist, name='api_reception_login'),
    path('patient_login/', views.patient_login_view, name='patient_login'),
    path('staff/q7r3m9xk/', views.recep_login_view, name='recep_login'),
    path('api/get-appointments/', views.get_appointments, name='get_appointments'),
    path('api/cancel-appointment/', views.cancel_appointment, name='cancel_appointment'),
    path('api/get-all-appointments/', views.get_all_appointments, name='get_all_appointments'),
    path('api/update-appointment-status/', views.update_appointment_status, name='update_appointment_status'),
    path('api/notify-patient/', views.notify_patient),
    path('api/notify-reception/', views.notify_reception),
    path('api/receptionist-reject/', views.receptionist_reject_appointment, name='receptionist_reject'),
    path('api/logout/', views.logout_patient, name='logout_patient'),
    path('api/save-feedback/', views.save_feedback, name='save_feedback'),
    path('api/get-feedbacks/', views.get_feedbacks, name='get_feedbacks'),
    #Email verification
    #path('verify-email/<str:token>/', views.verify_email, name='verify_email'),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
