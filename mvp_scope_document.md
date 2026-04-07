# Minimum Viable Product (MVP) Scope Document
## Product: AptioGen (v1.0)

### 1. MVP Definition & Scope
The MVP for AptioGen focuses on providing the foundational assessment and management capabilities for single/multiple institutions. It prioritizes core event creation, secure participation, and basic data analytics.

### 2. Core Feature Checklist (What's in v1.0)

#### 2.1 For Institution Admins
- [x] CRUD for Departments.
- [x] CRUD for Student Batches.
- [x] Event Creation Wizard (Random, Set, Upload methods).
- [x] Event Status Management (Pending → Active → Completed).
- [x] Basic Participant Dashboard with Scores and Ranks.
- [x] CSV Export for all participant data.
- [x] Automated Email Performance Reports.

#### 2.2 For Students
- [x] Department/Batch onboarding upon registration/profile completion.
- [x] Secure Password-Protected Quiz Entry.
- [x] Timer-driven Quiz Assessment Panel.
- [x] Automatic Score Calculation and Review (based on visibility logs).
- [x] Mobile-responsive assessment interface.

#### 2.3 Proctoring Features (MVP Level)
- [x] Mandatory Fullscreen Mode.
- [x] Disabling Copy/Paste.
- [x] Basic Tab-Switch detection/warning.
- [x] Automated submission on Timer Expiration.

#### 2.4 Super Admin Features
- [x] Platform Configuration settings.
- [x] Multi-Institution management (CRUD).
- [x] Global Question Bank for common categories (Aptitude, Reasoning, etc.).
- [x] Bulk Question Import from PDF/DOCX/TXT files.

### 3. Excluded Features (Out of Scope for MVP)
- [ ] Automated Verifiable PDF Certificates.
- [ ] Advanced Facial Recognition/Webcam Monitoring.
- [ ] Integration with External LMS (Google Classroom, Canvas).
- [ ] AI-driven individual student performance prediction.
- [ ] Native Android/iOS Mobile Apps.

### 4. Assumptions & Risks
- **Assumptions**: 
    - Institutions have reliable internet for the duration of the assessment.
    - Students have access to a device with a modern web browser.
- **Risks**: 
    - Internet interruption during quiz submission (Mitigated by server-side auto-submit).
    - Resource limits on free-tier database/hosting (Mitigated by efficient MongoDB queries).

### 5. Launch Readiness Criteria
1.  All security vulnerabilities identified in the audit are resolved.
2.  CSV export functionality is fully verified for accuracy.
3.  Question Bank supports at least 500+ questions across 5+ categories.
4.  Documentation (SRS, FRD, BRD, PRD) is complete and approved.
5.  Load testing shows the platform can handle 100+ concurrent students.
