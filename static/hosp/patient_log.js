
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
  showSection('patientAuth');  // show patient login form on page load
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
  
async function handleSignup(event) {
  event.preventDefault();
  const signupBtn = document.getElementById('patientSignupBtn');
  signupBtn.disabled = true;
  signupBtn.innerHTML = `<span class='spinner-border spinner-border-sm'></span> Signing up...`;

  const formData = new FormData(event.target);
  const email = formData.get('email').trim();
  const password = formData.get('password');

  try {
    const csrftoken = getCookie('csrftoken');
    const response = await fetch('/api/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json','X-CSRFToken': csrftoken },
      body: JSON.stringify({ email, password }),
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

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
async function uploadMedicalRecord(event) {
  event.preventDefault();
  const fileInput = document.getElementById('medicalRecordFile'); // Correct input ID
  const file = fileInput.files[0];

  if (!file) {
    alert('Please select a file to upload.');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    alert('File size exceeds 1MB. Please select a smaller file or compress it.');
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  // email no longer sent in formData — server reads from session
  const csrftoken = getCookie('csrftoken');
  const statusDiv = document.getElementById('uploadStatus');

  try {
    const response = await fetch('/api/upload-medical-record/', {
      method: 'POST',
      headers: { 'X-CSRFToken': csrftoken },
      body: formData  // email removed from formData — server reads from session
    });

    if (response.ok) {
      const data = await response.json();
      statusDiv.innerHTML = `<small style="color:green;">${data.message}</small>`;
      fileInput.value = '';
    } else {
      const error = await response.json();
      statusDiv.innerHTML = `<small style="color:red;">Error: ${error.error || 'Upload failed'}</small>`;
    }
  } catch (error) {
    statusDiv.innerHTML = `<small style="color:red;">Error: ${error.message}</small>`;
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
      // No profile found — keep profile inputs empty and editable
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
      const patientAppointments = data.appointments;

      document.getElementById('patientAppointments').innerHTML =
        patientAppointments.length > 0
          ? patientAppointments.map(app => {
              const service = app.doctor_name || app.service;
              const date = app.appointment_date || app.date;
              const time = app.appointment_time || app.time;
              const status = app.status || 'Pending';
              const token = app.token_number || null;

              let statusMessage = '';
              if (status === 'Confirmed') {
                statusMessage = `Your appointment is Confirmed. Token: ${token || 'Not assigned'}.`;
              } else if (status === 'Pending') {
                statusMessage = 'Your appointment is pending confirmation.';
              } else if (status === 'Rejected') {
                statusMessage = 'Your appointment was rejected.';
              }

              return `
                <div class="card mb-2">
                  <div class="card-body">
                    <p><strong>Service:</strong> ${service}</p>
                    <p><strong>Reason:</strong> ${app.reason || ''}</p>
                    <p><strong>Date:</strong> ${date}</p>
                    <p><strong>Time:</strong> ${time}</p>
                    <p><strong>Status:</strong> ${status}</p>
                    <p><strong>Token Number:</strong> ${
                      token ? token : '<span class="text-muted">Not assigned</span>'
                    }</p>
                    <p class="text-info">${statusMessage}</p>
                    <button onclick="cancelAppointment('${service}', '${date}', '${time}')" class="btn btn-sm btn-danger">
                      Cancel
                    </button>
                  </div>
                </div>
              `;
            }).join('')
          : '<p>No appointments found.</p>';
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
  try {
    const response = await fetch('/api/book-appointment/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      body: JSON.stringify({
        doctor_name: serviceType,
        reason: reason,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      alert(data.message || 'Appointment booked successfully!');
      event.target.reset();
      // Fetch latest appointments for this patient
      await loadPatientAppointments();
    } else {
      throw new Error(data.error || 'Failed to book appointment');
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}
document.addEventListener('DOMContentLoaded', loadPatientAppointments);

async function cancelAppointment(service, date, time) {
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
      await loadPatientAppointments(); // Refresh the list after deleting

      // NEW: notify receptionist via localStorage (same browser)
      const notification = {
        message: `Patient ${patient.email} cancelled appointment on ${date} at ${time}.`,
        timestamp: new Date().toISOString()
      };
      let receptionistNotifications =
        JSON.parse(localStorage.getItem('receptionistNotifications')) || [];
      receptionistNotifications.unshift(notification);
      localStorage.setItem(
        'receptionistNotifications',
        JSON.stringify(receptionistNotifications)
      );
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

document.getElementById('medicalRecordForm').addEventListener('submit', uploadMedicalRecord);


const TIME_SLOTS = [
  "09:00-10:00", "10:00-11:00", "11:00-12:00", "12:00-13:00",
  "14:00-15:00", "15:00-16:00", "16:00-17:00", "17:00-18:00"
];

function renderSlotStatusList(date, appointments) {
  let html = '';
  // Always reset -- enable all options before checking
  TIME_SLOTS.forEach(slot => {
    const option = document.getElementById('slot-' + slot);
    if (option) option.disabled = false;
  });
  TIME_SLOTS.forEach(slot => {
    const count = appointments.filter(app => app.date === date && (app.time === slot || app.appointment_time === slot)).length;
    let status = count >= 3 ? 'Fully Booked' : 'Opened'; // use 7 for production
    html += `<div>${slot}: <span class="${status === 'Fully Booked' ? 'text-danger' : 'text-success'}">${status}</span></div>`;
    const option = document.getElementById('slot-' + slot);
    if (option && status === 'Fully Booked') option.disabled = true;
  });
  document.getElementById('slotStatusList').innerHTML = html;
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
document.addEventListener('DOMContentLoaded', function(){
  const dateField = document.getElementById('appointmentDate');
  if (dateField && dateField.value) updateSlotStatusesForSelectedDate();
});
