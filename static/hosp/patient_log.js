
function showSection(sectionId) {
  // Hide all dashboards
  document.querySelectorAll('.dashboard').forEach(div => div.style.display = 'none');
  // Show the requested section
  const section = document.getElementById(sectionId);
  if (section) {
    section.style.display = 'block';
  } else {
    console.error("Section not found:", sectionId);
  }

  // Extra logic for dashboards
  if (sectionId === 'patientDashboard') {
    showPatientNotification();
    loadPatientAppointments();
  }
  if (sectionId === 'receptionDashboard') {
    renderReceptionistAppointments();
    renderCalendar(receptionistSelectedDate);
  }
}
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith(name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'signup') {
    showSection('patientSignup');
  } else {
    showSection('patientAuth');  // show patient login form on page load
  }
});
function showPatientNotification() {
  const patient = JSON.parse(localStorage.getItem('currentPatient'));
  let show = false;
  let message = '';
  // Check if patient object exists and has a notification
  if (patient && patient.notification) {
    show = true;
    message = patient.notification;
    // After showing, clear the notification so it doesn't persist
    delete patient.notification;
    localStorage.setItem('currentPatient', JSON.stringify(patient));
  }
  const notifDiv = document.getElementById('notification');
  if (notifDiv) {
    if (show) {
      notifDiv.innerHTML = message;
      notifDiv.style.display = '';
    } else {
      notifDiv.innerHTML = '';
      notifDiv.style.display = 'none';
    }
  }
}
  
let captchaAnswer = 0;
function generateCaptcha() {
  const captchaLabel = document.getElementById('captchaLabel');
  if (!captchaLabel) return;
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  captchaAnswer = num1 + num2;
  captchaLabel.innerHTML = `Security Question: What is ${num1} + ${num2}?`;
  const captchaInput = document.getElementById('captchaInput');
  if (captchaInput) captchaInput.value = '';
}

async function handleSignup(event) {
  event.preventDefault();

  // Validate passwords match
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('signupConfirmPassword').value;
  if (password !== confirmPassword) {
    alert('Error: Passwords do not match.');
    return;
  }

  // Validate CAPTCHA
  const userCaptcha = document.getElementById('captchaInput').value;
  if (parseInt(userCaptcha) !== captchaAnswer) {
    alert('Error: Incorrect answer to security question.');
    generateCaptcha();
    return;
  }

  const signupBtn = document.getElementById('patientSignupBtn');
  signupBtn.disabled = true;
  signupBtn.innerHTML = `<span class='spinner-border spinner-border-sm'></span> Signing up...`;

  const formData = new FormData(event.target);
  const email = formData.get('email').trim();
  const first_name = formData.get('first_name').trim();
  const last_name = formData.get('last_name').trim();
  const mobile = formData.get('mobile').trim();
  const age = formData.get('age') ? parseInt(formData.get('age')) : null;
  const blood_group = formData.get('blood_group');

  try {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch('/api/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json','X-CSRFToken': csrftoken },
      body: JSON.stringify({ email, password, first_name, last_name, mobile, age, blood_group }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(Object.values(errorData).flat().join(' '));
    }

    const data = await response.json();
    alert(data.message || 'Registration successful! Please check your email to verify your account.');
    event.target.reset();
    showSection('patientAuth'); // Navigate to login page

  } catch (error) {
    alert('Error: ' + error.message);
    generateCaptcha();
  } finally {
    signupBtn.disabled = false;
    signupBtn.innerHTML = 'Sign Up';
  }
}
async function handlePatientLogin(event) {
  event.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const loginBtn = document.getElementById('patientLoginBtn');
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Logging in...';
  try {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch('/api/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrftoken },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Login failed');
    }
    const data = await response.json();
    // Save minimal user info like email or token if needed
    localStorage.setItem('currentPatient', JSON.stringify(data));

    // Show patient dashboard
    showSection('patientDashboard');

    // Fetch profile from backend, then load profile UI
    await fetchPatientProfile(email);

    // Load any additional data like appointments
    loadPatientAppointments();

    event.target.reset();
  } catch (error) {
      if (error.message === 'User not found'){
         alert('No account exists for this email. Please create a new account first using the Sign Up option.');
      } else{
        alert('Error: ' + error.message);
      }
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Login';
  }
}

// Bind the form submission event


function setProfileFieldsReadonly(readonly) {
    const fields = ['firstName', 'lastName', 'age', 'bloodGroup', 'mobile'];
    fields.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.readOnly = readonly;
        element.disabled = readonly;
      }
    });
    // Special handling for bloodGroup which is a select element
    const bloodGroup = document.getElementById('bloodGroup');
    if (bloodGroup) {
      bloodGroup.disabled = readonly;
    }
}

document.addEventListener('DOMContentLoaded', function() {
  const editBtn = document.getElementById('editProfileBtn');
  const saveBtn = document.getElementById('saveProfileBtn');
  const profileForm = document.querySelector('form[onsubmit="saveProfile(event)"]');
  
  if (editBtn && saveBtn && profileForm) {
    // Make fields editable by default
    setProfileFieldsReadonly(false);
    
    // Handle form submission
    profileForm.addEventListener('submit', function(e) {
      e.preventDefault();
      saveProfile(e);
    });
  }
});
function populateProfileForm(profile) {
  // Remove skeleton shimmer from all profile fields
  ['firstName', 'lastName', 'age', 'bloodGroup', 'mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('skeleton');
  });

  document.getElementById('firstName').value = profile.first_name || '';
  document.getElementById('lastName').value = profile.last_name || '';
  document.getElementById('age').value = profile.age || '';
  document.getElementById('bloodGroup').value = profile.blood_group || '';
  document.getElementById('mobile').value = profile.mobile || '';

  // If profile exists, make inputs readonly and enable edit button
  if (profile.first_name || profile.last_name) {
    setProfileFieldsReadonly(true);
    document.getElementById('saveProfileBtn').disabled = true;
    document.getElementById('editProfileBtn').disabled = false;
  } else {
    // New or empty profile, inputs editable and save enabled
    setProfileFieldsReadonly(false);
    document.getElementById('saveProfileBtn').disabled = false;
    document.getElementById('editProfileBtn').disabled = true;
  }
}

async function fetchPatientProfile(email) {
  const csrftoken = getCookie('csrftoken');
  try {
    const response = await fetch('/api/get-profile/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      body: JSON.stringify({}), // email read from session on server
    });

    if (response.ok) {
      const profile = await response.json();
      // Call a function to populate your profile form inputs with this data
      populateProfileForm(profile);
    } else {
      // No profile found — remove skeleton and keep inputs editable
      ['firstName', 'lastName', 'age', 'bloodGroup', 'mobile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('skeleton');
      });
      setProfileFieldsReadonly(false);
      document.getElementById('saveProfileBtn').disabled = false;
      document.getElementById('editProfileBtn').disabled = true;
    }
  } catch (error) {
    alert('Failed to load profile: ' + error.message);
  }
}

async function saveProfile(event) {
  event.preventDefault();

  const csrftoken = getCookie('csrftoken');
  const email = JSON.parse(localStorage.getItem('currentPatient')).email;

  const profileData = {
    email: email,
    first_name: document.getElementById('firstName').value.trim(),
    last_name: document.getElementById('lastName').value.trim(),
    age: parseInt(document.getElementById('age').value, 10),
    blood_group: document.getElementById('bloodGroup').value,
    mobile: document.getElementById('mobile').value.trim(),
  };

  try {
    const response = await fetch('/api/update-profile/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert('Failed to save profile: ' + (errorData.error || 'Unknown error'));
      return;
    }

    alert('Profile saved successfully!');

    setProfileFieldsReadonly(true);
    document.getElementById('saveProfileBtn').disabled = true;
    document.getElementById('editProfileBtn').disabled = false;

    const patient = JSON.parse(localStorage.getItem('currentPatient'));
    patient.profile = {
      firstName: profileData.first_name,
      lastName: profileData.last_name,
      age: profileData.age,
      bloodGroup: profileData.blood_group,
      mobile: profileData.mobile,
    };
    localStorage.setItem('currentPatient', JSON.stringify(patient));

  } catch (error) {
    alert('Error saving profile: ' + error.message);
  }
}

// Enable editing — make form inputs editable, enable save button, disable edit button
function enableProfileEditing() {
  setProfileFieldsReadonly(false);
  document.getElementById('saveProfileBtn').disabled = false;
  document.getElementById('editProfileBtn').disabled = true;
}

// Make inputs readonly or editable based on argument
function setProfileFieldsReadonly(readonly) {
  ['firstName', 'lastName', 'age', 'bloodGroup', 'mobile'].forEach(id => {
    const elem = document.getElementById(id);
    if (elem.tagName.toLowerCase() === 'select') {
      elem.disabled = readonly;  // disable/enable select properly
    } else {
      elem.readOnly = readonly;  // set readOnly for inputs/textareas
    }
  });
}
function showNotification() {
    const patient = JSON.parse(localStorage.getItem('currentPatient'));
    const allPatients = JSON.parse(localStorage.getItem('patients'));
    const current = allPatients.find(p => p.email === patient.email);

    if (current.notification) {
        alert(current.notification); // Show popup message
        delete current.notification; // Clear after showing

        // Update storage
        const updatedPatients = allPatients.map(p => p.email === current.email ? current : p);
        localStorage.setItem('patients', JSON.stringify(updatedPatients));
    }
}
let activeAppointmentTab = 'upcoming';

function switchAppointmentTab(tabName) {
  activeAppointmentTab = tabName;
  const btnUpcoming = document.getElementById('tab-upcoming');
  const btnPast = document.getElementById('tab-past');
  if (btnUpcoming && btnPast) {
    if (tabName === 'upcoming') {
      btnUpcoming.classList.add('active');
      btnPast.classList.remove('active');
    } else {
      btnPast.classList.add('active');
      btnUpcoming.classList.remove('active');
    }
  }
  loadPatientAppointments();
}

async function loadPatientAppointments() {
  const patient = JSON.parse(localStorage.getItem('currentPatient'));
  if (!patient || !patient.email) {
    document.getElementById('patientAppointments').innerHTML =
      '<p>Please log in to view appointments.</p>';
    return;
  }

  const csrftoken = getCookie('csrftoken');

  try {
    const response = await fetch('/api/get-appointments/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      body: JSON.stringify({}) // email now read from session on server
    });

    const data = await response.json();

    if (response.ok && Array.isArray(data.appointments)) {
      const allAppointments = data.appointments;
      const todayStr = new Date().toISOString().split('T')[0];

      // Filter based on selected tab (Upcoming vs Past/Canceled/Rejected)
      const filteredAppointments = allAppointments.filter(app => {
        const date = app.appointment_date || app.date;
        const status = app.status || 'Pending';
        const isUpcoming = (status === 'Confirmed' || status === 'Pending') && (date >= todayStr);
        return activeAppointmentTab === 'upcoming' ? isUpcoming : !isUpcoming;
      });

      document.getElementById('patientAppointments').innerHTML =
        filteredAppointments.length > 0
          ? filteredAppointments.map(app => {
              const service = app.service_name || app.service;
              const date = app.appointment_date || app.date;
              const time = app.appointment_time || app.time;
              const status = app.status || 'Pending';
              const token = app.token_number || null;

              let statusClass = 'text-muted';
              let statusMessage = '';
              if (status === 'Confirmed') {
                statusMessage = `Confirmed (Token: ${token || 'Pending'})`;
                statusClass = 'text-success fw-bold';
              } else if (status === 'Pending') {
                statusMessage = 'Awaiting receptionist confirmation.';
                statusClass = 'text-warning fw-semibold';
              } else if (status === 'Rejected') {
                statusMessage = `Appointment was declined by staff.${app.rejection_reason ? ` (Reason: ${app.rejection_reason})` : ''}`;
                statusClass = 'text-danger fw-bold';
              } else if (status === 'Canceled') {
                statusMessage = 'Appointment has been cancelled.';
                statusClass = 'text-secondary fw-semibold';
              }

              // Parse date safely to retrieve Month abbreviation and Day value
              let dayVal = '';
              let monthVal = '';
              const parts = date.split('-');
              if (parts.length === 3) {
                dayVal = parseInt(parts[2], 10);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const mIdx = parseInt(parts[1], 10) - 1;
                monthVal = months[mIdx] || 'Date';
              } else {
                const dateObj = new Date(date);
                if (!isNaN(dateObj.getTime())) {
                  dayVal = dateObj.getDate();
                  monthVal = dateObj.toLocaleString('en-US', { month: 'short' });
                } else {
                  dayVal = 'App';
                  monthVal = 'Date';
                }
              }

              let cancelBtnHTML = '';
              if (date >= todayStr) {
                if (status === 'Pending') {
                  cancelBtnHTML = `<button onclick="cancelAppointment('${service}', '${date}', '${time}')" class="btn btn-sm btn-outline-danger mt-2">Cancel</button>`;
                } else if (status === 'Confirmed') {
                  cancelBtnHTML = `<button class="btn btn-sm btn-outline-secondary mt-2" disabled title="Confirmed appointments cannot be canceled online. Please contact the clinic.">Cancel</button>`;
                }
              }

              return `
                <div class="appointment-card d-flex align-items-stretch">
                  <div class="app-date-block">
                    <div class="app-date-day">${dayVal}</div>
                    <div class="app-date-month">${monthVal}</div>
                    <div class="app-time">${time}</div>
                  </div>
                  <div class="app-details-block d-flex flex-column justify-content-center">
                    <div class="app-service-title">${service}</div>
                    <p class="app-reason-text"><strong>Reason:</strong> ${app.reason || 'Regular Visit'}</p>
                  </div>
                  <div class="app-meta-block">
                    <span class="badge-status badge-${status.toLowerCase()}">${status}</span>
                    ${token ? `<span class="badge-token">Token: ${token}</span>` : ''}
                    ${statusMessage ? `<div class="small text-end mt-1 ${statusClass}">${statusMessage}</div>` : ''}
                    ${cancelBtnHTML}
                  </div>
                </div>
              `;
            }).join('')
          : `
            <div class="app-empty-state">
              <div class="app-empty-icon">📅</div>
              <h5>No ${activeAppointmentTab === 'upcoming' ? 'upcoming' : 'past'} appointments found</h5>
              <p class="text-muted small">${
                activeAppointmentTab === 'upcoming'
                  ? 'Need to see a doctor? Book an appointment below to get started.'
                  : 'Your past appointment history will appear here.'
              }</p>
              ${
                activeAppointmentTab === 'upcoming'
                  ? `<a href="#serviceType" class="btn btn-sm btn-primary mt-2">Book Appointment</a>`
                  : ''
              }
            </div>
          `;
    } else {
      document.getElementById('patientAppointments').innerHTML =
        '<p>No appointments found.</p>';
    }
  } catch (error) {
    document.getElementById('patientAppointments').innerHTML =
      '<p>Error loading appointments.</p>';
  }
}


async function bookAppointment(event) {
  event.preventDefault();
  const serviceType = document.getElementById('serviceType').value;
  const reason = document.getElementById('reasonForVisit').value;
  const appointmentDate = document.getElementById('appointmentDate').value;
  const appointmentTime = document.getElementById('appointmentTime').value;
  const csrftoken = getCookie('csrftoken');
  
  const submitBtn = event.target.querySelector('button[type="submit"]');
  let originalText = '';
  if (submitBtn) {
    originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Booking...';
  }

  try {
    const response = await fetch('/api/book-appointment/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      body: JSON.stringify({
        service_name: serviceType,
        reason: reason,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      alert(data.message || 'Appointment booked successfully!');
      event.target.reset();
      const grid = document.getElementById('slotGridContainer');
      if (grid) {
        grid.innerHTML = '<div class="col-12 text-muted small"><i class="text-secondary">Please select a date first to view available time slots.</i></div>';
      }
      // Fetch latest appointments for this patient
      await loadPatientAppointments();
    } else {
      throw new Error(data.error || 'Failed to book appointment');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}
document.addEventListener('DOMContentLoaded', loadPatientAppointments);

async function cancelAppointment(service, date, time) {
  const confirmCancel = confirm(`Are you sure you want to cancel your ${service} appointment on ${date} at ${time}?`);
  if (!confirmCancel) return;

  const patient = JSON.parse(localStorage.getItem('currentPatient'));
  const csrftoken = getCookie('csrftoken');
  try {
    const response = await fetch('/api/cancel-appointment/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken
      },
      body: JSON.stringify({
        service: service,
        date: date,
        time: time
        // email removed — server reads from session
      })
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message || 'Appointment cancelled.');
      await loadPatientAppointments(); // Refresh the list after cancelling
    } else {
      alert(data.error || 'Could not cancel appointment.');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Medical Record Upload Script
const MAX_FILE_SIZE_MB = 1;
const medicalRecordForm = document.getElementById('medicalRecordForm');
const medicalRecordFile = document.getElementById('medicalRecordFile');
const uploadStatus = document.getElementById('uploadStatus');                                // --- Receptionist Calendar & Add Appointment ---

async function logout() {
  const csrftoken = getCookie('csrftoken');
  try {
    // Tell server to clear the session
    await fetch('/api/logout/', {
      method: 'POST',
      headers: { 'X-CSRFToken': csrftoken }
    });
  } catch (e) {
    console.warn('Logout request failed:', e);
  }
  // Clear local storage and redirect
  localStorage.removeItem('currentPatient');
  window.location.href = '/';
}



const TIME_SLOTS = [
  "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00",
  "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00"
];

function formatSlotTime(slot) {
  const timeMap = {
    "09:00-10:00": "9:00 AM – 10:00 AM",
    "10:00-11:00": "10:00 AM – 11:00 AM",
    "11:00-12:00": "11:00 AM – 12:00 PM",
    "12:00-13:00": "12:00 PM – 1:00 PM",
    "14:00-15:00": "2:00 PM – 3:00 PM",
    "15:00-16:00": "3:00 PM – 4:00 PM",
    "16:00-17:00": "4:00 PM – 5:00 PM",
    "17:00-18:00": "5:00 PM – 6:00 PM"
  };
  return timeMap[slot] || slot;
}

function selectSlot(slotValue) {
  const container = document.getElementById('slotGridContainer');
  if (!container) return;
  
  // Find card representing this slot value
  const selectedCard = container.querySelector(`[data-slot="${slotValue}"]`);
  if (!selectedCard || selectedCard.classList.contains('disabled')) return;
  
  // Clear previous selections
  container.querySelectorAll('.slot-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // Select new card
  selectedCard.classList.add('selected');
  
  // Update hidden input
  document.getElementById('appointmentTime').value = slotValue;
}

// Attach to window so HTML inline onclick handler can access it
window.selectSlot = selectSlot;

function renderSlotStatusList(date, appointments) {
  let html = '';
  
  // Reset hidden input value when date changes
  const timeInput = document.getElementById('appointmentTime');
  if (timeInput) timeInput.value = '';

  const selectedService = document.getElementById('serviceType').value;

  TIME_SLOTS.forEach(slot => {
    // Count existing appointments for this slot, department, and date
    const count = appointments.filter(app => {
      const appDate = app.date || app.appointment_date;
      const appTime = app.time || app.appointment_time;
      const status = app.status || 'Pending';
      const appService = app.service_name || app.service;
      return appDate === date && 
             appTime === slot && 
             appService === selectedService && 
             status !== 'Canceled' && 
             status !== 'Rejected';
    }).length;

    let statusText = '';
    let statusClass = '';
    let isDisabled = false;

    if (count >= 3) {
      statusText = '🔒 Fully Booked';
      statusClass = 'text-danger';
      isDisabled = true;
    } else if (count === 2) {
      statusText = '🟡 Only 1 Slot Left!';
      statusClass = 'text-warning';
    } else if (count === 1) {
      statusText = '🟢 2 Slots Available';
      statusClass = 'text-success';
    } else {
      statusText = '🟢 3 Slots Available';
      statusClass = 'text-success';
    }

    const readableTime = formatSlotTime(slot);

    html += `
      <div class="col">
        <div class="slot-card ${isDisabled ? 'disabled' : ''}" data-slot="${slot}" onclick="selectSlot('${slot}')">
          <div class="slot-time">${readableTime}</div>
          <div class="slot-status ${statusClass}">${statusText}</div>
        </div>
      </div>
    `;
  });

  const gridContainer = document.getElementById('slotGridContainer');
  if (gridContainer) {
    gridContainer.innerHTML = html;
  }
}

async function updateSlotStatusesForSelectedDate() {
  const date = document.getElementById('appointmentDate').value;
  if (!date) return;
  try {
    const response = await fetch('/api/get-all-appointments/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date })
    });
    const data = await response.json();
    if (response.ok && Array.isArray(data.appointments)) {
      renderSlotStatusList(date, data.appointments);
    } else {
      renderSlotStatusList(date, []);
    }
  } catch (err) {
    renderSlotStatusList(date, []);
  }
}

document.getElementById('appointmentDate').addEventListener('change', updateSlotStatusesForSelectedDate);
const serviceTypeField = document.getElementById('serviceType');
if (serviceTypeField) {
  serviceTypeField.addEventListener('change', updateSlotStatusesForSelectedDate);
}
document.addEventListener('DOMContentLoaded', function(){
  const dateField = document.getElementById('appointmentDate');
  if (dateField) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateField.min = `${yyyy}-${mm}-${dd}`;
    if (dateField.value) updateSlotStatusesForSelectedDate();
  }
  generateCaptcha();
});

// --- Feedback & Ratings (inside patient dashboard) ---
const feedbackForm = document.getElementById('feedbackForm');
const feedbackListDiv = document.getElementById('feedbackList');
const feedbackMsg = document.getElementById('feedbackMsg');
const starRatingDiv = document.getElementById('starRating');
const feedbackRatingInput = document.getElementById('feedbackRating');

// Star rating click logic
if (starRatingDiv && feedbackRatingInput) {
  starRatingDiv.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', function() {
      const rating = this.getAttribute('data-value');
      feedbackRatingInput.value = rating;
      starRatingDiv.querySelectorAll('.star').forEach(s => {
        s.style.color = s.getAttribute('data-value') <= rating ? '#ffc107' : '#ccc';
      });
    });
  });
}

// Load feedbacks from backend
async function renderFeedbackList() {
  if (!feedbackListDiv) return;
  try {
    const response = await fetch('/api/get-feedbacks/');
    const data = await response.json();
    const feedbacks = data.feedbacks || [];
    if (feedbacks.length === 0) {
      feedbackListDiv.innerHTML = '<em class="text-muted">No feedback yet. Be the first!</em>';
      return;
    }
    feedbackListDiv.innerHTML = feedbacks.map(f => `
      <div class="border rounded p-2 mb-2">
        <strong>${f.service_name}</strong>
        <span class="text-warning ms-1">${'&#9733;'.repeat(f.rating)}${'&#9734;'.repeat(5 - f.rating)}</span>
        <small class="text-muted ms-2">${f.submitted_at}</small><br/>
        <span>${f.text}</span><br/>
        <small class="text-secondary">— By ${f.patient_name || 'Anonymous'}</small>
      </div>
    `).join('');
  } catch (err) {
    feedbackListDiv.innerHTML = '<em class="text-muted">Could not load feedback.</em>';
  }
}

// Submit feedback to backend
if (feedbackForm) {
  feedbackForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const serviceName = document.getElementById('feedbackService').value.trim();
    const text = document.getElementById('feedbackText').value.trim();
    const rating = parseInt(feedbackRatingInput.value, 10);
    if (!serviceName || !text || !rating) {
      feedbackMsg.innerHTML = '<span class="text-danger">Please fill all fields and select a star rating.</span>';
      return;
    }
    try {
      const response = await fetch('/api/save-feedback/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_name: serviceName, text, rating })
      });
      const result = await response.json();
      if (response.ok) {
        feedbackMsg.innerHTML = '<span class="text-success">Thank you for your feedback!</span>';
        feedbackForm.reset();
        feedbackRatingInput.value = 0;
        if (starRatingDiv) starRatingDiv.querySelectorAll('.star').forEach(s => s.style.color = '#ccc');
        await renderFeedbackList();
      } else {
        feedbackMsg.innerHTML = `<span class="text-danger">${result.error || 'Failed to submit.'}</span>`;
      }
    } catch (err) {
      feedbackMsg.innerHTML = '<span class="text-danger">Network error. Please try again.</span>';
    }
  });
}

// Load feedback on page load
document.addEventListener('DOMContentLoaded', renderFeedbackList);
