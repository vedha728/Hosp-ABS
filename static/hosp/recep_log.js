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
   
   if (passkey !== '7874') {
     alert('Please enter the correct passkey.');
     return;
   }
   if (!username || !password) {
     alert('Please enter both username and password.');
     return;
   }
   
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

function toggleRejectedSection() {
  const archiveBody = document.getElementById('rejectedAppointmentsList');
  if (archiveBody) {
    if (archiveBody.style.display === 'none') {
      archiveBody.style.display = 'block';
    } else {
      archiveBody.style.display = 'none';
    }
  }
}
window.toggleRejectedSection = toggleRejectedSection;

async function loadAppointments() {
    const pendingContainer = document.getElementById('pendingAppointmentsList');
    const confirmedContainer = document.getElementById('confirmedAppointmentsList');
    const rejectedContainer = document.getElementById('rejectedAppointmentsList');
    
    if (!pendingContainer || !confirmedContainer || !rejectedContainer) return;

    // If no date yet, default to today
    if (!receptionistSelectedDate) {
        const today = new Date();
        receptionistSelectedDate = today.toISOString().slice(0, 10); // "YYYY-MM-DD"
    }

    // Update Confirmed Header Date Label
    const confirmedHeaderTitle = document.getElementById('confirmedHeaderTitle');
    if (confirmedHeaderTitle) {
        try {
            const d = new Date(receptionistSelectedDate);
            const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            confirmedHeaderTitle.innerHTML = `✅ Confirmed Schedule (${formatted})`;
        } catch(e) {
            confirmedHeaderTitle.innerHTML = `✅ Confirmed Schedule (${receptionistSelectedDate})`;
        }
    }

    const csrftoken = getCookie('csrftoken');
    try {
        const res = await fetch('/api/get-all-appointments/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrftoken
            },
            body: JSON.stringify({ all: true }) // fetch all appointments
        });

        const data = await res.json();

        if (!res.ok) {
            console.error('Backend error:', data);
            pendingContainer.innerHTML = 'Error loading appointments.';
            return;
        }

        appointments = Array.isArray(data.appointments) ? data.appointments : [];

        // Partition lists
        const pendingList = appointments.filter(app => app.status === 'Pending');
        const confirmedList = appointments.filter(app => app.status === 'Confirmed' && app.date === receptionistSelectedDate);
        const rejectedList = appointments.filter(app => app.status === 'Rejected');

        // Update counts
        document.getElementById('pendingCount').innerText = pendingList.length;
        document.getElementById('confirmedCount').innerText = confirmedList.length;
        document.getElementById('rejectedCount').innerText = rejectedList.length;

        // Render Pending List (Inbox)
        pendingContainer.innerHTML = pendingList.length === 0
            ? '<p class="text-muted mb-0">No pending requests found.</p>'
            : pendingList.map(app => {
                const token = app.token_number || '';
                return `
                    <div class="card mb-2 bg-white border-0 shadow-sm"><div class="card-body">
                    <h5 class="fw-bold">${app.patient_email || 'Unknown'}</h5>
                    <p class="mb-1"><strong>Service:</strong> ${app.service_name || 'Not specified'}</p>
                    <p class="mb-1"><strong>Reason:</strong> ${app.reason || ''}</p>
                    <p class="mb-2"><strong>Requested Date:</strong> ${app.date} at ${app.time}</p>
                    <div class="d-flex gap-2">
                        <button onclick="confirmAppointment(${app.id}, this)" class="btn btn-sm btn-success px-3">Confirm</button>
                        <button onclick="deleteAppointment(${app.id})" class="btn btn-sm btn-danger px-3">Reject</button>
                    </div>
                    </div></div>
                `;
            }).join('');

        // Render Confirmed List (Daily Schedule)
        confirmedContainer.innerHTML = confirmedList.length === 0
            ? `<p class="text-muted mb-0">No confirmed appointments scheduled for ${receptionistSelectedDate}.</p>`
            : confirmedList.map(app => {
                const token = app.token_number || '';
                return `
                    <div class="card mb-2 bg-white border-0 shadow-sm"><div class="card-body">
                    <h5 class="fw-bold text-success">${app.patient_email || 'Unknown'}</h5>
                    <p class="mb-1"><strong>Service:</strong> ${app.service_name || 'Not specified'}</p>
                    <p class="mb-1"><strong>Reason:</strong> ${app.reason || ''}</p>
                    <p class="mb-2"><strong>Time Session:</strong> ${app.time}</p>
                    <div>
                        <strong>Appointment Id:</strong> 
                        <span class="badge bg-success">${token || 'Not assigned'}</span>
                    </div>
                    </div></div>
                `;
            }).join('');

        // Render Rejected List (Archive Log)
        rejectedContainer.innerHTML = rejectedList.length === 0
            ? '<p class="text-muted mb-0">No rejected appointments.</p>'
            : rejectedList.map(app => {
                return `
                    <div class="card mb-2 bg-light border-0"><div class="card-body py-2">
                    <div class="d-flex justify-content-between">
                      <span class="fw-bold text-danger">${app.patient_email || 'Unknown'}</span>
                      <span class="text-muted small">${app.date} at ${app.time}</span>
                    </div>
                    <p class="mb-0 text-muted small">Service: ${app.service_name || 'Not specified'} | Reason: ${app.reason || 'None'}</p>
                    ${app.rejection_reason ? `<p class="mb-0 text-danger small mt-1"><strong>Rejection Reason:</strong> ${app.rejection_reason}</p>` : ''}
                    </div></div>
                `;
            }).join('');

    } catch (err) {
        console.error('Error loading appointments:', err);
        pendingContainer.innerHTML = 'Error loading appointments.';
    }
}



function renderCalendar(selectedDateStr) {
  const year = calendarYear;
  const month = calendarMonth;
  const daysInMonth = getMonthDays(year, month);
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

function clearReceptionistNotifications() {
  localStorage.removeItem('receptionistNotifications');
  document.getElementById('notificationsList').innerHTML = '<p>No notifications.</p>';
}


async function confirmAppointment(appointmentId, btnElement) {
  // Find appointment in our global list by id
  const appointment = appointments.find(app => app.id === appointmentId);
  if (!appointment) {
    alert('Appointment missing; cannot update.');
    return;
  }

  const csrftoken = getCookie('csrftoken');
  
  let originalText = '';
  if (btnElement) {
    originalText = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Confirming...';
  }

  try {
    const res = await fetch('/api/update-appointment-status/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken
      },
      body: JSON.stringify({
        id: appointmentId,
        status: 'Confirmed'
      })
    });

    const data = await res.json();
    console.log('update-appointment-status response:', data);

    if (!res.ok) {
      alert('Error updating appointment: ' + (data.error || 'Unknown error'));
      return;
    }

    const assignedToken = data.token_number || '';
    
    // Notify patient with the auto-generated token from the server
    await fetch('/api/notify-patient/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken
      },
      body: JSON.stringify({
        email: appointment.patient_email,
        message: `Your appointment on ${appointment.date} at ${appointment.time} is Confirmed. Token: ${assignedToken}.`
      })
    });

    appointment.status = 'Confirmed';
    appointment.token_number = assignedToken;
    loadAppointments();
  } catch (err) {
    console.error('Error calling update-appointment-status:', err);
    alert('Network error while updating appointment.');
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.innerHTML = originalText;
    }
  }
}


function deleteAppointment(appointmentId) {
  const appointment = appointments.find(app => app.id === appointmentId);
  if (!appointment) {
    alert('Appointment not found.');
    return;
  }
  
  window.appointmentIdToReject = appointmentId;
  const textarea = document.getElementById('rejectionReasonText');
  if (textarea) textarea.value = '';
  const errorEl = document.getElementById('rejectionReasonError');
  if (errorEl) errorEl.classList.add('d-none');
  
  const modalEl = document.getElementById('rejectReasonModal');
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  } else {
    // Fallback if modal is not found
    const reason = prompt("Please enter the reason for rejection:");
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      alert("Rejection reason is mandatory!");
      return;
    }
    submitRejection(appointmentId, trimmed);
  }
}

async function submitRejection(appointmentId, reason) {
  const appointment = appointments.find(app => app.id === appointmentId);
  if (!appointment) return;

  const csrftoken = getCookie('csrftoken');

  try {
    const res = await fetch('/api/receptionist-reject/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken
      },
      body: JSON.stringify({ id: appointmentId, rejection_reason: reason })
    });

    const data = await res.json();
    console.log('receptionist-reject response:', data);

    if (!res.ok) {
      alert('Error rejecting appointment: ' + (data.error || 'Unknown error'));
      return;
    }

    appointment.status = 'Rejected';
    loadAppointments();
  } catch (err) {
    console.error('Error calling receptionist-reject:', err);
    alert('Network error while rejecting appointment.');
  }
}

  async function receptionistLogout() {
  localStorage.removeItem('currentReceptionist');
  try {
    const csrftoken = getCookie('csrftoken');
    await fetch('/api/logout/', { 
      method: 'POST',
      headers: { 'X-CSRFToken': csrftoken }
    });
  } catch(e) {}
  window.location.href = '/';
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
          <strong>${f.service_name}</strong>
          <span class="text-warning ms-2">${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}</span>
          <small class="text-muted ms-2">${f.submitted_at}</small>
          <p class="mb-0 mt-1">${f.text}</p>
          <small class="text-secondary">— By ${f.patient_name || 'Anonymous'}</small>
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

  // Reject modal confirm handler
  const confirmRejectBtn = document.getElementById('confirmRejectBtn');
  if (confirmRejectBtn) {
    confirmRejectBtn.addEventListener('click', () => {
      const reason = document.getElementById('rejectionReasonText').value.trim();
      if (!reason) {
        const errorEl = document.getElementById('rejectionReasonError');
        if (errorEl) errorEl.classList.remove('d-none');
        return;
      }
      
      const modalEl = document.getElementById('rejectReasonModal');
      if (modalEl) {
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();
      }
      
      submitRejection(window.appointmentIdToReject, reason);
    });
  }
});