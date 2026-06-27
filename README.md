# CureWell Hospital Management System (HMS)

CureWell HMS is a modern, premium web-based hospital administration and scheduling portal designed for both patients and medical reception staff. The system supports online appointment bookings, user profiles, automated status updates, email confirmations, real-time dashboards, and multilingual localized interfaces.

---

## 🛠️ Tech Stack

*   **Backend:** Python 3.x, Django 5.0, Django REST Framework (DRF)
*   **Database:** MySQL (configured via `PyMySQL` adapter)
*   **Frontend:** HTML5, CSS3 Custom Variables & Flexbox Layouts, Vanilla ES6 JavaScript
*   **Authentication & Safety:** Session-based user isolation, security verification questions, token-based email verification, and CSRF token protection
*   **APIs & Notifications:** SMTP (Gmail API integration) for confirmation and rejection emails
*   **Deployment:** Fully optimized for serverless deployment on Vercel (`vercel.json`)

---

## 🌟 Key Features

### 🏢 Patient Portal
*   **Email Verification:** Registration is securely bound to verification tokens sent to the patient's inbox.
*   **Personal Profile:** Manage and edit name, age, blood group, and mobile number. Fully responsive layouts with loading skeletons while fetching data.
*   **Safe Slot Booking:**
    *   **Tomorrow-Only Constraint:** Bookings are disabled for same-day slots. Patients can only book slots starting tomorrow to give staff time to prepare.
    *   **Department Capacity Limits:** Automatically blocks time slots once 3 bookings are registered for a specific department and date.
*   **0ms Tab Switches:** Locally caches active appointments in client memory so switching between *Upcoming* and *History* tabs happens instantly without network lag.
*   **Feedback & Ratings:** Share reviews and star ratings directly from the dashboard.

### 💼 Receptionist Portal
*   **Real-time State Syncing:** Automatically polls the database every 20 seconds to fetch incoming bookings and updates.
*   **Interactive Calendar:** Filter and inspect schedules for any selected date in a grid calendar.
*   **Approval Workflow:** Review pending appointments, approve them (assigning an automatic token number), or reject them (with custom rejection comments).
*   **Automated Patient Alerts:** Confirmations and rejection emails are automatically dispatched to patients when their status changes.

### 🌐 Premium Homepage
*   **Modern Aesthetics:** Deep navy headers, gradient hero grids, ambient glows, and clean cards.
*   **Multilingual Support:** Fully toggleable Tamil (தமிழ்) and English translation layers mapping all site copy instantly.
*   **Emergency Band:** High-visibility emergency actions panel with quick dial links.

---

## 📂 Project Structure

```
├── hms_project/           # Django project root settings and routing
├── hosp/                  # Main application directory
│   ├── models.py          # Database schemas (Patient, Appointment, Feedback, etc.)
│   ├── views.py           # REST APIs & template views
│   ├── urls.py            # Route mappings
│   └── templates/hosp/    # UI Views (index, login, signup, verification)
├── static/hosp/           # Frontend assets
│   ├── patient_log.js     # Patient dashboard frontend logic & caching
│   ├── recep_log.js       # Receptionist dashboard, calendar, and polling logic
│   └── hero_lobby.png     # Custom generated branded lobby asset
├── vercel.json            # Vercel serverless deployment config
├── requirements.txt       # Project python dependencies
└── README.md              # Project documentation
```

---

## 🚀 Setup & Installation

### 1. Prerequisites
Ensure you have **Python 3.10+** and **MySQL** installed.

### 2. Clone the Project
```bash
git clone <repository-url>
cd HMS-WEB
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Environment Configuration
Create a `.env` file in the project root:
```env
DEBUG=True
SECRET_KEY=your-django-secret-key

# Database Connection
DB_NAME=hms_db
DB_USER=root
DB_PASSWORD=your_password
DB_HOST=127.0.0.1
DB_PORT=3306

# Email SMTP Settings (for Verification/Rejections)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_HOST_PASSWORD=your_app_password
DEFAULT_FROM_EMAIL=your_email@gmail.com
```

### 5. Run Database Migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### 6. Start the Server
```bash
python manage.py runserver
```
Visit the local server at `http://127.0.0.1:8000/`.
