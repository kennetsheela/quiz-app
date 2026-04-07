# Functional Requirements Document (FRD)
## Project: AptioGen (Quiz Assessment Platform)

### 1. Functional Overview
AptioGen is an end-to-end assessment platform designed to automate the process of creating, conducting, and analyzing examinations in institutional settings. The system provides a multi-tenant architecture where institutions can manage their internal structures (Departments, Batches) and schedule proctored exams for their students.

---

### 2. User Roles and Permissions
| Role | Authorization | Key Functions |
|---|---|---|
| **Super Admin** | Platform-Wide | Global settings, Question Bank, Institution Management. |
| **Institution Admin** | Institution-Wide | Dept/Batch creation, User Management, Campus Events. |
| **HOD (Dept Head)** | Department-Specific | Staff access, Departmental Analytics, Student monitoring. |
| **Staff Member** | Assigned Access | View department results, assist in event monitoring. |
| **Student** | Assessment Entry | Participate in quizzes, view results/rankings. |

---

### 3. Core Functional Modules

#### 3.1 Authentication & Profile Management
- **Multi-Auth Support**: Support for both Firebase-driven Google Auth and traditional local credentials.
- **Persistent Sessions**: Use of HttpOnly secure cookies for authenticated API access.
- **Profile Configuration**: 
    - Students must provide Roll No, Department, and Batch upon first entry.
    - Institutions can configure their Name, Location, and Type.
- **Role Guards**: Server-side redirection and API middleware to prevent role-jumping (e.g., HOD accessing Institution Admin panel).

#### 3.2 Institution Infrastructure Management
- **Department Module**:
    - CRUD operations for departments.
    - Mapping of HODs and Staff to specific departments.
- **Batch Module**:
    - Year-wise cohort management.
    - Automatic mapping of students to batches based on entry data.
- **Access Control**: Provision for granting/revoking roles via email address without requiring fresh registration.

#### 3.3 Question Bank Management
- **Global Repository**: Super-admin controlled central bank categorized by "Aptitude", "Technical", "Coding", etc.
- **Dynamic Retrieval**: Ability to fetch random questions based on category and difficulty.
- **Bulk Ingestion**: Support for parsing PDF, DOCX, and TXT files into structured MongoDB question documents using regex-based extraction.

#### 3.4 Event (Assessment) Engine
- **Event Wizard**: 4-step workflow to launch a quiz:
    1. **Details**: Title, Time Interval, Category, Duration.
    2. **Targets**: Select specific Departments and Batches.
    3. **Content**: Choose Random bank, Pre-defined set, or Local File upload.
    4. **Security**: Configure proctoring toggles.
- **Assessment Logic**:
    - **Marking**: Supports custom marks per question and fractional negative marking (e.g., -0.25, -0.5).
    - **Attempt Limits**: Enforcement of maximum allowed attempts per student.
    - **Status Lifecycle**: Transition from `Pending` → `Active` → `Completed`.

#### 3.5 Secure Assessment & Proctoring
- **Environment Locking**: 
    - Fullscreen enforcement (auto-submit or warn on exit).
    - Tab Switching detection (tracks switch counts).
    - Clipboard Locking (Disables Copy/Paste).
- **Execution**: 
    - Real-time timer synced with the server.
    - Randomization of question order for each participant.
    - Auto-submission upon timer expiry.

#### 3.6 Analytics & Reporting
- **Real-Time Leaderboard**: Display rank and scores based on configured visibility (Hidden, Rank+Scores, Full).
- **Metric Dashboards**: Visual charts for average scores, participation rates, and category-wise performance.
- **Data Export**:
    - One-click CSV export of participant data (Roll No, Name, Score, Time Spent).
    - Email-based reporting for institutional performance audits.

---

### 4. Process Workflows

#### 4.1 Assessment Launch Workflow (Institution Admin)
1. Admin selects "Launch Event" from Dashboard.
2. Form fields entered for timing/category.
3. System fetches available Departments/Batches for targeting.
4. If "Random" method is chosen, system validates category question count in Bank.
5. If "Upload" method is chosen, system parses file and saves questions directly to the unique Event object.
6. Event is saved as `Pending`.
7. Admin clicks `Activate` to make it visible to students.

#### 4.2 Quiz Participation Workflow (Student)
1. Student enters Assessment Portal.
2. System checks if current user belongs to targeted Department/Batch.
3. If valid, student provides Event Password.
4. Quiz launches in mandatory Fullscreen.
5. Student answers questions; responses stored in local memory and periodically synced/submitted at end.
6. Results calculated and stored in `EventParticipant` record.

---

### 5. Data Requirements
- **User Record**: Meta-data for role, institution association, and profile details.
- **Event Record**: Stores configuration, proctoring rules, and the full array of questions (to ensure permanence regardless of Bank changes).
- **Participant Record**: Detailed logs of time-stamps (started/completed), raw answers, calculated score, and proctoring violations.

---

### 6. System Interfaces
- **External Auth**: Firebase Authentication API.
- **Cloud Storage**: Storage for institution logos and uploaded documents.
- **Reporting Engine**: Internal CSV generator and Nodemailer SMTP integration.
