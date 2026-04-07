# Software Requirements Specification (SRS) 
## Project: AptioGen (Quiz Assessment Platform)

### 1. Introduction
#### 1.1 Purpose
This document specifies the software requirements for **AptioGen**, a comprehensive quiz and assessment platform designed for educational institutions to conduct secure, automated, and analytical examinations.

#### 1.2 Scope
AptioGen is a web-based SaaS platform that enables:
- **Institutions** to manage departments, students, and batches.
- **Administrators** to create and monitor assessment events.
- **Students** to take quizzes under proctored conditions.
- **Super Admins** to manage the global platform settings and question bank.

#### 1.3 Definitions and Abbreviations
- **JWT**: JSON Web Token for authentication.
- **IDOR**: Insecure Direct Object Reference (security vulnerability).
- **Proctoring**: Monitoring of candidates during an exam to prevent cheating.
- **HOD**: Head of Department.

---

### 2. Overall Description
#### 2.1 Product Functions
- Multi-role access (Super Admin, Institution Admin, HOD, Student).
- Comprehensive dashboard for each role with real-time metrics.
- Event (Quiz) Creation Wizard with three methods: Random from Bank, Specific Sets, and Manual File Upload.
- Automated proctoring features (Fullscreen lock, tab switch detection, webcam monitoring placeholder).
- Detailed analytics and CSV reporting for assessment results.
- Global Question Bank management with bulk import capabilities.

#### 2.2 User Classes and Characteristics
- **Super Admin**: Manages the platform, global settings, and adds new institutions. High technical authority.
- **Institution Admin**: Manages institution-specific data (Depts, Batches, Students) and creates campus-wide events.
- **HOD/Staff**: Manages department-specific assessments and student performance.
- **Student**: Participates in assigned assessments and views personal results.

#### 2.3 Operating Environment
- **Platform**: Web-based (Cross-browser compatible).
- **Frontend**: Firebase Hosting.
- **Backend**: Node.js environment (v18+).
- **Database**: MongoDB Atlas.

---

### 3. Functional Requirements

#### 3.1 Super Admin Module
- **Platform Management**: Configure platform-wide settings (e.g., maintenance mode, global messages).
- **Question Bank Management**: 
    - Add/Edit/Delete questions globally.
    - Bulk upload questions via PDF/DOCX/TXT files.
- **Institution Management**: Onboard new institutions and manage their subscription status.
- **Analytics**: View global platform performance and usage metrics.

#### 3.2 Institution Admin Module
- **Dashboard**: High-level view of active events, student count, and average performance.
- **Department & Batch Management**: 
    - Create/Delete departments.
    - Assign HODs and Staff access.
    - Manage student batches (Year-wise cohorts).
- **Event (Quiz) Management**:
    - **Wizard-based Creation**: Set event name, category, duration, and target audience.
    - **Targeting**: Filter by specific departments and batches or set as "Public".
    - **Proctoring Setup**: Enable/Disable fullscreen lock, tab switch lock, etc.
- **Results & Exports**: 
    - View real-time participant progress.
    - Export participant lists and scores to CSV.
    - Performance reporting via email.

#### 3.3 HOD/Staff Module
- **Department Dashboard**: Monitor department-specific student performance.
- **Access Management**: Grant/Revoke staff access within the department.
- **Assessment Monitoring**: Review results for students belonging to their department.

#### 3.4 Student Module
- **Authentication**: Secure login via email/password or Institution-provided credentials.
- **Assessment Interface**:
    - View active/upcoming events.
    - Take quizzes with a timer.
    - **Proctoring**: Mandatory fullscreen mode, auto-submit on tab-switch (if enabled).
- **Results**: View score cards and rankings (based on event visibility settings).

#### 3.5 Quiz Engine Features
- **Randomization**: Randomize question sequence per student.
- **Scoring**: Automated grading with support for negative marking.
- **Auto-Submission**: Quizzes automatically submit when the timer expires or the end-time is reached.

---

### 4. External Interface Requirements
#### 4.1 User Interfaces
- Responsive design for Laptops/Desktops and Mobile devices.
- Integrated Dark/Light mode theme support.
- Interactive charts using Chart.js for analytics.

#### 4.2 Software Interfaces
- **Firebase Authentication**: For user identity management.
- **MongoDB Atlas**: For document-oriented data storage.
- **Nodemailer**: For automated email reporting.

---

### 5. Non-Functional Requirements
#### 5.1 Security
- **Authentication**: JWT tokens stored in `HttpOnly` cookies + sessionStorage fallback for cross-origin support.
- **Authorization**: Role-based access control (RBAC) enforced at the middleware level.
- **Input Sanitization**: Protection against ReDoS and NoSQL injection.
- **Environment Protection**: Restricted exposure of [.env](file:///e:/quiz-app/.env) configurations.

#### 5.2 Performance
- **Low Latency**: Dashboard metrics cached or efficiently aggregated.
- **Scalability**: Stateless backend logic to handle concurrent quiz participants.

#### 5.3 Reliability
- **Concurrent Access**: Stable handling of 100+ simultaneous students taking a quiz.
- **Error Handling**: Graceful error UI that doesn't leak system stack traces.

---

### 6. Technical Stack Overview
- **Frontend**: HTML5, Vanilla CSS3, Javascript (ES6), Chart.js, Font Awesome.
- **Backend**: Node.js, Express.js.
- **Database**: MongoDB (Mongoose ORM).
- **Security**: Helmet.js (Security Headers), CORS (Allowed Origins), Bcrypt (Password Hashing).
- **Cloud**: Firebase (Auth/Hosting), Hostinger (API Hosting). 
