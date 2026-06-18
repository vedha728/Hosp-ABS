console.log("recep_log.js loaded");
let appointments = [];
let calendarYear = (new Date()).getFullYear();
let calendarMonth = (new Date()).getMonth();
let receptionistSelectedDate = null;
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
async function handleReceptionLogin(event) {
  event.preventDefault();
  console.log('Receptionist login function triggered');
  const passkey = document.getElementById('receptionPasskey').value;
  const username = document.getElementById('receptionUser').value;
  const password = document.getElementById('receptionPass').value;
  const loginBtn = document.getElementById('receptionLoginBtn');
  loginBtn.disabled = true;
  loginBtn.innerHTML = 'Logging in...';
  try {
      const response = await fetch('/api/reception-login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passkey, username, password })
    });
    console.log('Response status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('Login success data:', data);
      alert('Receptionist logged in successfully');
      console.log('Before showing dashboard');
      showSection('receptionDashboard');
      console.log('After showing dashboard');
      renderCalendar(receptionistSelectedDate); // draw calendar
      loadAppointments();                        // fetch from backend
      loadReceptionistNotifications();
    } else {
      const error = await response.json();
      console.log('Login failed error:', error);
      alert("Login failed: " + (error.error || "Unknown error"));
    }
  } catch (err) {
    console.log('Error during login:', err);
    alert("Error: " + err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = 'Login';
  }
}

async function loadAppointments() {
    const container = document.getElementById('appointmentsList');
    if (!container) return;

    // If no date yet, default to today
    if (!receptionistSelectedDate) {
        const today = new Date();
        receptionistSelectedDate = today.toISOString().slice(0, 10); // "YYYY-MM-DD"
    }

    const csrftoken = getCookie('csrftoken');
    try {
        const res = await fetch('/api/get-all-appointments/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            body: JSON.stringify({ date: receptionistSelectedDate })
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('Backend error:', data);
            container.innerHTML = 'Error loading appointments.';
            return;
        }

        appointments = Array.isArray(data.appointments) ? data.appointments : [];

        if (appointments.length === 0) {
            container.innerHTML = 'No appointments for selected date.';
            return;
        }

        container.innerHTML = appointments.map((app, index) => {
        const token = app.token_number || '';          // from backend
        const isConfirmed = app.status === 'Confirmed';

        return `
            <div class="card mb-2"><div class="card-body">
            <h5>${app.patient_email || 'Unknown'}</h5>
            <p><strong>Service:</strong> ${app.doctor || app.doctor_name || 'Not specified'}</p>
            <p><strong>Reason:</strong> ${app.reason || ''}</p>
            <p><strong>Date:</strong> ${app.date} at ${app.time}</p>
            <p><strong>Status:</strong> 
                <span class="badge ${isConfirmed ? 'bg-success' : 'bg-warning'}">
                ${app.status || 'Pending'}
                </span>
            </p>
            <div class='mt-2'>
                <strong>Appointment Id:</strong> 
                <span class='badge bg-info'>${token || 'Not assigned'}</span>
            </div>
            <div class="d-flex gap-2 align-items-center mb-2">
                <label class="me-2 mb-0" for="tokenSelect_${index}"><strong>Assign Appointment Id:</strong></label>
                <select id="tokenSelect_${index}" class="form-select form-select-sm w-auto" ${isConfirmed ? 'disabled' : ''}>
                <option value="">Select token</option>
                <option value="App01">App01</option>
                <option value="App02">App02</option>
                <option value="App03">App03</option>
                </select>
            </div>

            
            <div class="d-flex gap-2 align-items-center">
                <button onclick="confirmAppointmentWithToken(${index})" class="btn btn-sm btn-success" ${isConfirmed ? 'disabled' : ''}>Confirm</button>
                <button onclick="deleteAppointment(${index})" class="btn btn-sm btn-danger" ${isConfirmed ? 'disabled' : ''}>Reject</button>
            </div>

            </div></div>
        `;
        }).join('');
    } catch (err) {
        console.error('Error loading appointments:', err);
        container.innerHTML = 'Error loading appointments.';
    }
}


function renderReceptionistAppointments() {
  console.log("renderReceptionistAppointments ran");
  console.log('appointments at render:', appointments);
  let filtered = appointments;
  if (receptionistSelectedDate) {
    filtered = appointments.filter(app => app.date === receptionistSelectedDate);
  }
  document.getElementById('appointmentsList').innerHTML = filtered.length === 0
    ? '<p>No appointments for selected date.</p>'
    : filtered.map((app, index) => {
      // Appointment No: app01, app02, ... only up to 07
      const appointmentNo = `app${String(index + 1).padStart(2, '0')}`;
      // Limit display to first 7 appointments
      if (index >= 7) return '';
      return `
      <div class="card mb-2"><div class="card-body">
        <h5>${app.patientName || app.patient || 'Unknown'}</h5>
        <p><strong>Service:</strong> ${app.service}</p>
        <p><strong>Date:</strong> ${app.date} at ${app.time}</p>
        <p><strong>Status:</strong> <span class="badge ${app.status === 'Pending' ? 'bg-warning' : 'bg-success'}">${app.status}</span></p>
        <p><strong>Assigned Doctor:</strong> ${app.doctor || 'Not Assigned'}</p>
        <div class="d-flex gap-2 align-items-center">
          <button onclick="confirmAppointmentWithToken(${index})" class="btn btn-sm btn-success">Confirm</button>
          <button onclick="deleteAppointment(${index})" class="btn btn-sm btn-danger">Reject</button>
        </div>
        <div class='mt-2'><strong>Appointment No.:</strong> <span class='badge bg-info'>${appointmentNo}</span></div>
      </div></div>
      `;
    }).join('');
}
function renderCalendar(selectedDateStr) {
  const year = calendarYear;
  const month = calendarMonth;
  const daysInMonth = getMonthDays(year, month);
  // Month/Year navigation
  let monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let html = `<div class='d-flex justify-content-between align-items-center mb-2'>
    <button class='btn btn-sm btn-outline-secondary' onclick='changeCalendarMonth(-1)'>&lt;</button>
    <span class='fw-bold fs-5'>${monthNames[month]} ${year}</span>
    <button class='btn btn-sm btn-outline-secondary' onclick='changeCalendarMonth(1)'>&gt;</button>
    <select id='calendarYearSelect' class='form-select form-select-sm w-auto ms-2' onchange='changeCalendarYear(this.value)'>`;
  for (let y = year-5; y <= year+5; y++) {
    html += `<option value='${y}' ${y===year?'selected':''}>${y}</option>`;
  }
  html += `</select></div>`;
  html += '<table class="table table-bordered text-center"><tr>';
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekDays.forEach(d => html += `<th>${d}</th>`);
  html += '</tr><tr>';
  let firstDay = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstDay; i++) html += '<td></td>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = '';
    if (selectedDateStr === dateStr) cls = 'table-primary';
    html += `<td class="calendar-day ${cls}" data-date="${dateStr}">${d}</td>`;
    if ((firstDay + d) % 7 === 0) html += '</tr><tr>';
  }
  html += '</tr></table>';
  document.getElementById('calendarContainer').innerHTML = html;
  document.querySelectorAll('.calendar-day').forEach(td => {
  td.onclick = function() {
    console.log('calendar day clicked:', td.getAttribute('data-date'));
    receptionistSelectedDate = td.getAttribute('data-date'); // "YYYY-MM-DD"
    renderCalendar(receptionistSelectedDate);
    loadAppointments();  // get data from Django for this date
  };
});

}
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
  renderCalendar(receptionistSelectedDate);
  loadAppointments();
  }
}



// Main DOMContentLoaded: set up event handlers, initial view
document.addEventListener('DOMContentLoaded', function() {
  // 1. Show login form only at page load
  showSection('receptionAuth');


  // 2. Manage passkey input and show credentials form
  const passkeyInput = document.getElementById('receptionPasskey');
  const credentialsDiv = document.getElementById('receptionCredentials');
  const passkeyError = document.getElementById('passkeyError');
  if (passkeyInput) {
    passkeyInput.addEventListener('input', function() {
      if (passkeyInput.value === '7874') {
        credentialsDiv.style.display = 'block';
        passkeyError.style.display = 'none';
        passkeyInput.setAttribute('readonly', 'readonly');
      } else {
        credentialsDiv.style.display = 'none';
        if (passkeyInput.value.length === 4) {
          passkeyError.style.display = 'block';
        } else {
          passkeyError.style.display = 'none';
        }
      }
    });
  }


  // 3. Attach appointment form submission handler, if present
  const form = document.getElementById('addAppointmentForm');
  if (form) {
    form.onsubmit = function(e) {
      e.preventDefault();
      const email = document.getElementById('modalPatientEmail').value.trim();
      const service = document.getElementById('modalServiceType').value;
      const date = document.getElementById('modalAppointmentDate').value;
      const time = document.getElementById('modalAppointmentTime').value;


      if (!email || !service || !date || !time) {
        document.getElementById('addAppointmentStatus').innerHTML = '<span class="text-danger">All fields are required.</span>';
        return;
      }


      // Attempt to get patient name from available patients
      let patientName = email;
      if (window.patients && Array.isArray(window.patients)) {
        const found = window.patients.find(p => p.email === email);
        if (found && found.profile && found.profile.firstName) {
          patientName = `${found.profile.firstName} ${found.profile.lastName || ''}`.trim();
        }
      }


      // Sync local storage and global appointments array
      appointments = JSON.parse(localStorage.getItem('appointments')) || [];
      appointments.push({
        patient: email,
        patientName,
        service,
        date,
        time,
        status: 'Pending',
        doctor: ''
      });
      localStorage.setItem('appointments', JSON.stringify(appointments));


      // Add notification for receptionist
      const newNotification = {
        message: `New appointment booked by ${patientName} for ${service} on ${date} at ${time}.`,
        timestamp: new Date().toISOString()
      };
      let receptionistNotifications = JSON.parse(localStorage.getItem('receptionistNotifications')) || [];
      receptionistNotifications.unshift(newNotification);
      localStorage.setItem('receptionistNotifications', JSON.stringify(receptionistNotifications));
      loadReceptionistNotifications(); // <-- Add this line here
      // Show success message and update UI after a short delay
      document.getElementById('addAppointmentStatus').innerHTML = '<span class="text-success">Appointment added.</span>';
      setTimeout(() => {
        closeAddAppointmentModal();
        renderAppointmentsWrapper();
      }, 800);
    };
  }
});


function loadReceptionistNotifications() {
  // Fetch notifications from localStorage or use an empty array if none exist
  let receptionistNotifications = JSON.parse(localStorage.getItem('receptionistNotifications')) || [];


  // Render notifications in the UI
  document.getElementById('notificationsList').innerHTML = receptionistNotifications.map(note => `
    <div class="alert alert-info">
      <p>${note.message}</p>
      <small>${new Date(note.timestamp).toLocaleString()}</small>
    </div>
  `).join('');
}
// --- Patient notification fix ---
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

// --- Receptionist Calendar & Add Appointment ---
function getMonthDays(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function changeCalendarMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth < 0) {
    calendarMonth = 11;
    calendarYear--;
  } else if (calendarMonth > 11) {
    calendarMonth = 0;
    calendarYear++;
  }
  renderCalendar(receptionistSelectedDate);
  loadAppointments();       // use backend
}


function changeCalendarYear(year) {
  calendarYear = parseInt(year);
  renderCalendar(receptionistSelectedDate);
  loadAppointments();       // use backend
}

// Show Add Appointment Modal
function showAddAppointmentModal() {
  console.log('Add Appointment modal - visible dashboard:', document.querySelector('.dashboard[style*="block"]')?.id);
  document.getElementById('addAppointmentModal').style.display = 'block';
  document.getElementById('addAppointmentModal').style.zIndex = '1055'; // Optional, ensure above dashboards
  document.body.classList.add('modal-open');
  document.getElementById('addAppointmentForm').reset();
  document.getElementById('addAppointmentStatus').innerHTML = '';
}
// Close Add Appointment Modal
function closeAddAppointmentModal() {
  document.getElementById('addAppointmentModal').style.display = 'none';
  document.body.classList.remove('modal-open');
  document.getElementById('addAppointmentForm').reset();
  document.getElementById('addAppointmentStatus').innerHTML = '';
}
function clearReceptionistNotifications() {
  localStorage.removeItem('receptionistNotifications');
  document.getElementById('notificationsList').innerHTML = '<p>No notifications.</p>';
}


async function confirmAppointmentWithToken(index) {
  const tokenSelect = document.getElementById(`tokenSelect_${index}`);
  const tokenNumber = tokenSelect ? tokenSelect.value : '';
  if (!tokenNumber) {
    alert('Please select a token number before confirming.');
    return;
  }

  const appointment = appointments[index];
  if (!appointment || !appointment.id) {
    alert('Appointment id missing; cannot update.');
    console.log('appointment at index', index, appointment);
    return;
  }

  const csrftoken = getCookie('csrftoken');

  try {
    const res = await fetch('/api/update-appointment-status/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken
      },
      body: JSON.stringify({
        id: appointment.id,
        status: 'Confirmed',
        token_number: tokenNumber
      })
    });

    const data = await res.json();
    console.log('update-appointment-status response:', data);

    if (!res.ok) {
      alert('Error updating appointment: ' + (data.error || 'Unknown error'));
      return;
    }
    // 1) NOTIFY PATIENT HERE
    await fetch('/api/notify-patient/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken
    },
    body: JSON.stringify({
        email: appointment.patient_email,
        message: `Your appointment on ${appointment.date} at ${appointment.time} is Confirmed. Token: ${tokenNumber}.`
    })
    });
    // Update local copy and refresh UI from backend
    appointment.status = 'Confirmed';
    appointment.token_number = tokenNumber;
    loadAppointments();
  } catch (err) {
    console.error('Error calling update-appointment-status:', err);
    alert('Network error while updating appointment.');
  }
}


async function deleteAppointment(index) {
  const appointment = appointments[index];
  if (!appointment || !appointment.id) {
    alert('Appointment not found in list.');
    return;
  }

  const csrftoken = getCookie('csrftoken');

  try {
    const res = await fetch('/api/receptionist-reject/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken
      },
      body: JSON.stringify({ id: appointment.id })
    });

    const data = await res.json();
    console.log('receptionist-reject response:', data);

    if (!res.ok) {
      alert('Error rejecting appointment: ' + (data.error || 'Unknown error'));
      return;
    }

    // OPTIONAL: notify patient (local UI only, or via status they’ll see)
    appointment.status = 'Rejected';
    loadAppointments();  // reload list with Rejected status
  } catch (err) {
    console.error('Error calling receptionist-reject:', err);
    alert('Network error while rejecting appointment.');
  }
}

// Initial calendar and appointments
//if (document.getElementById('calendarContainer')) {
  //renderCalendar(null);
  //renderReceptionistAppointments();
//}
// This code runs when an appointment is booked successfully:
function onAppointmentBooked(patientName, serviceType, appointmentDate, appointmentTime) {
  const newNotification = {
    message: `New appointment booked by ${patientName} for ${serviceType} on ${appointmentDate} at ${appointmentTime}.`,
    timestamp: new Date().toISOString()
  };

  // Fetch existing notifications
  let receptionistNotifications = JSON.parse(localStorage.getItem('receptionistNotifications')) || [];
  // Add the new notification at the start (or end)
  receptionistNotifications.unshift(newNotification);
  // Save back to localStorage
  localStorage.setItem('receptionistNotifications', JSON.stringify(receptionistNotifications));
  // Refresh UI
  loadReceptionistNotifications();
}

function receptionistLogout() {
  // Optionally clear any receptionist info from storage if you save it there
  localStorage.removeItem('currentReceptionist');
  // Redirect to home page (or any landing/login page you want)
  window.location.href = '/';
  // window.close(); // Only works sometimes, see previous notes
}

// --- Patient Feedback ---
async function loadFeedbacks() {
  const container = document.getElementById('receptionFeedbackList');
  if (!container) return;
  try {
    const response = await fetch('/api/get-feedbacks/');
    const data = await response.json();
    const feedbacks = data.feedbacks || [];
    if (feedbacks.length === 0) {
      container.innerHTML = '<em class="text-muted">No feedback submitted yet.</em>';
      return;
    }
    container.innerHTML = feedbacks.map(f => `
      <div class="border rounded p-3 mb-2 d-flex justify-content-between align-items-start">
        <div>
          <strong>${f.doctor}</strong>
          <span class="text-warning ms-2">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</span>
          <small class="text-muted ms-2">${f.submitted_at}</small>
          <p class="mb-0 mt-1">${f.text}</p>
        </div>
        <span class="badge bg-${f.rating >= 4 ? 'success' : f.rating === 3 ? 'warning' : 'danger'} ms-3">
          ${f.rating}/5
        </span>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<em class="text-danger">Could not load feedback.</em>';
  }
}

// Auto-load feedback whenever receptionist dashboard is shown
const _origShowSection = typeof showSection === 'function' ? showSection : null;
document.addEventListener('DOMContentLoaded', () => {
  // Load feedbacks when dashboard becomes visible
  const dashboard = document.getElementById('receptionDashboard');
  if (dashboard) {
    const observer = new MutationObserver(() => {
      if (dashboard.style.display !== 'none') {
        loadFeedbacks();
      }
    });
    observer.observe(dashboard, { attributes: true, attributeFilter: ['style'] });
  }
});