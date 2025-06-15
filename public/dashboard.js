document.addEventListener('DOMContentLoaded', function() {
    const userRole = localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('userName');

    if (!userRole || !userId) {
        window.location.href = '/login.html';
        return;
    }

    document.getElementById('userName').textContent = userName;

    const roleDisplayMap = {
        'student': 'Student',
        'student_advisor': 'Student Advisor',
        'professor': 'Professor',
        'administrative_staff': 'Administrative Staff'
    };
    document.getElementById('userRole').textContent = roleDisplayMap[userRole] || userRole;

    if (userRole === 'student' || userRole === 'student_advisor') {
        document.querySelectorAll('.professor-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.student-only').forEach(el => el.style.display = 'block');
    } else if (userRole === 'professor') {
        document.querySelectorAll('.student-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.professor-only').forEach(el => el.style.display = 'block');
    } else if (userRole === 'administrative_staff') {
        document.querySelectorAll('.student-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.professor-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
    }

    loadAvailableCourses();

    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('allCourses').addEventListener('click', loadAvailableCourses);
    document.getElementById('analyticsReport')?.addEventListener('click', loadAnalyticsReport);

    if (userRole === 'student' || userRole === 'student_advisor') {
        document.getElementById('myCourses').addEventListener('click', loadEnrolledCourses);
        document.getElementById('myAdvisors').addEventListener('click', loadAdvisors);
    } else if (userRole === 'professor') {
        document.getElementById('departmentManagement').addEventListener('click', loadDepartmentInfo);
        document.getElementById('enrolledStudents').addEventListener('click', loadEnrolledStudentsForProfessor);
    } else if (userRole === 'administrative_staff') {
        document.getElementById('studentManagement').addEventListener('click', loadStudentManagement);
        document.getElementById('createStudent').addEventListener('click', showCreateStudentModal);
    }
});

function logout() {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    window.location.href = '/login.html';
}

async function loadAvailableCourses() {
    setActiveNavItem('allCourses');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';

    const role = localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');

    try {
        let courses;

        if (role === 'professor') {
            const response = await fetch(`/api/courses?professor_id=${userId}`);
            courses = await response.json();
        } else if (role === 'student' || role === 'student_advisor') {
            const response = await fetch(`/api/courses?student_id=${userId}`);
            courses = await response.json();
        } else {
            const response = await fetch('/api/courses');
            courses = await response.json();
        }

        let html = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Available Courses</h5>
                    ${role === 'professor' ?
            '<button class="btn btn-sm btn-primary" onclick="openCourseModal()"><i class="bi bi-plus-circle"></i> Add Course</button>'
            : ''}
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Course ID</th>
                                    <th>Course Name</th>
                                    <th>Credits</th>
                                    <th>Seats Available</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>`;

        if (!Array.isArray(courses) || courses.length === 0) {
            html += `<tr><td colspan="6" class="text-center">No courses available</td></tr>`;
        } else {
            courses.forEach(course => {
                html += `
                    <tr>
                        <td>${course.course_id}</td>
                        <td>${course.course_name}</td>
                        <td>${course.credits}</td>
                        <td>${course.seats_available}</td>
                        <td>`;

                if ((role === 'student' || role === 'student_advisor') && !course.is_enrolled) {
                    html += `<button class="btn btn-sm btn-success" onclick="enrollDirectly(${course.course_id})">
                                <i class="bi bi-plus-circle"></i> Enroll
                              </button>`;
                } else if (role === 'professor') {
                    html += `<button class="btn btn-sm btn-primary me-1" onclick="editCourse(${course.course_id})">
                                <i class="bi bi-pencil"></i>
                              </button>
                              <button class="btn btn-sm btn-danger" onclick="deleteCourse(${course.course_id})">
                                <i class="bi bi-trash"></i>
                              </button>`;
                }

                html += `</td></tr>`;
            });
        }

        html += `</tbody></table></div></div></div>`;
        contentArea.innerHTML = html;

    } catch (error) {
        console.error('Error loading courses:', error);
        contentArea.innerHTML = `<div class="alert alert-danger">Error loading courses: ${error.message}</div>`;
    }
}

function loadEnrolledCourses() {
    setActiveNavItem('myCourses');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';

    const studentId = localStorage.getItem('userId');

    fetch(`/api/students/${studentId}/courses`)
        .then(response => response.json())
        .then(enrollments => {
            let totalCredits = 0;
            const maxCredits = 20;

            let html = `
                <div class="card mb-3">
                    <div class="card-header">
                        <h5 class="mb-0">My Enrolled Courses</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Course Name</th>
                                        <th>Credits</th>
                                        <th>Grade</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>`;

            if (enrollments.length === 0) {
                html += `<tr><td colspan="4" class="text-center">You are not enrolled in any courses</td></tr>`;
            } else {
                enrollments.forEach(enrollment => {
                    totalCredits += enrollment.credits || 0;
                    html += `
                        <tr>
                            <td>${enrollment.course_name}</td>
                            <td>${enrollment.credits}</td>
                            <td>${enrollment.grade || 'Not graded'}</td>
                            <td>
                                <button class="btn btn-sm btn-danger" onclick="dropCourse(${enrollment.enrollment_id})">
                                    <i class="bi bi-x-circle"></i> Drop
                                </button>
                            </td>
                        </tr>`;
                });
            }

            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-body">
                        <h6 class="mb-0">Total Enrolled Credits: <strong>${totalCredits}</strong></h6>
                        <p class="mb-0 text-muted">Maximum Allowed Credits: <strong>${maxCredits}</strong></p>
                    </div>
                </div>`;

            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading enrolled courses:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading enrolled courses: ${error.message}</div>`;
        });
}

function loadAdvisors() {
    setActiveNavItem('myAdvisors');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';

    const studentId = localStorage.getItem('userId');

    fetch(`/api/students/${studentId}/advisors`)
        .then(response => response.json())
        .then(advisors => {
            let html = `
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">My Student Advisor</h5>
                    </div>
                    <div class="card-body">`;

            if (!Array.isArray(advisors)) {
                advisors = [advisors].filter(Boolean);
            }

            if (advisors.length === 0) {
                html += `<div class="alert alert-info">
                    <i class="bi bi-info-circle"></i>
                    You don't have a student advisor assigned yet. Please contact administrative staff.
                </div>`;
            } else {
                html += `<div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Advisor Name</th>
                                <th>Email</th>
                                <th>Department</th>
                            </tr>
                        </thead>
                        <tbody>`;

                advisors.forEach(advisor => {
                    html += `
                        <tr>
                            <td>${advisor.name}</td>
                            <td>${advisor.email}</td>
                            <td>${advisor.department_name || 'Not assigned'}</td>
                        </tr>`;
                });

                html += `</tbody></table></div>`;
            }

            html += `</div></div>`;
            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading advisors:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading advisors: ${error.message}</div>`;
        });
}

function enrollDirectly(courseId) {
    const studentId = localStorage.getItem('userId');
    const MAX_CREDITS = 20;

    fetch(`/api/students/${studentId}/courses`)
        .then(response => response.json())
        .then(currentEnrollments => {
            const currentCredits = currentEnrollments.reduce((sum, course) => sum + (course.credits || 0), 0);

            fetch(`/api/courses/${courseId}`)
                .then(response => response.json())
                .then(course => {
                    const newTotal = currentCredits + course.credits;

                    if (newTotal > MAX_CREDITS) {
                        alert(`You cannot enroll in this course.\nIt would exceed the max allowed credits (${MAX_CREDITS}).\nCurrent: ${currentCredits} + ${course.credits} = ${newTotal}`);
                        return;
                    }

                    if (confirm(`Do you want to enroll in "${course.course_name}"?`)) {
                        fetch('/api/enrollments', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                student_id: studentId,
                                course_id: courseId
                            })
                        })
                            .then(response => response.json())
                            .then(result => {
                                if (result.success) {
                                    alert('Successfully enrolled in course!');
                                    loadAvailableCourses();
                                } else {
                                    alert('Enrollment failed: ' + result.message);
                                }
                            })
                            .catch(error => {
                                console.error('Enrollment error:', error);
                                alert('Enrollment failed: ' + error.message);
                            });
                    }
                });
        })
        .catch(error => {
            console.error('Error checking credit limit:', error);
            alert('An error occurred while checking your credits.');
        });
}

function dropCourse(enrollmentId) {
    if (confirm('Are you sure you want to drop this course?')) {
        fetch(`/api/enrollments/${enrollmentId}`, {
            method: 'DELETE'
        })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    loadEnrolledCourses();
                } else {
                    alert('Failed to drop course: ' + result.message);
                }
            })
            .catch(error => {
                console.error('Error dropping course:', error);
                alert('Failed to drop course: ' + error.message);
            });
    }
}

function loadDepartmentInfo() {
    setActiveNavItem('departmentManagement');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';

    const professorId = localStorage.getItem('userId');

    fetch(`/api/professors/${professorId}/department`)
        .then(response => response.json())
        .then(department => {
            let html = `
                <div class="card mb-4">
                    <div class="card-header">
                        <h5 class="mb-0">Department Information</h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h6>Department Name</h6>
                                <p>${department.name || 'Not assigned to a department'}</p>
                            </div>
                            <div class="col-md-6">
                                <h6>Location</h6>
                                <p>${department.location || 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                </div>`;

            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading department info:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading department information: ${error.message}</div>`;
        });
}

function loadEnrolledStudentsForProfessor() {
    setActiveNavItem('enrolledStudents');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';

    const professorId = localStorage.getItem('userId');

    fetch(`/api/professors/${professorId}/students`)
        .then(response => response.json())
        .then(data => {
            let html = `
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Students Enrolled in My Courses</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Student Name</th>
                                        <th>Email</th>
                                        <th>Course Name</th>
                                    </tr>
                                </thead>
                                <tbody>`;

            if (data.length === 0) {
                html += `<tr><td colspan="3" class="text-center">No students enrolled in your courses.</td></tr>`;
            } else {
                data.forEach(row => {
                    html += `
                        <tr>
                            <td>${row.student_name}</td>
                            <td>${row.email}</td>
                            <td>${row.course_name}</td>
                        </tr>`;
                });
            }

            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>`;

            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading students:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading student list: ${error.message}</div>`;
        });
}

function loadStudentManagement() {
    setActiveNavItem('studentManagement');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';

    fetch('/api/admin/students', {
        headers: {
            'user-role': localStorage.getItem('userRole'),
            'user-id': localStorage.getItem('userId')
        }
    })
        .then(response => response.json())
        .then(students => {
            let html = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Student Management</h5>
                    <button class="btn btn-sm btn-primary" onclick="showCreateStudentModal()">
                        <i class="bi bi-person-plus"></i> Create New Student
                    </button>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Student ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Date of Birth</th>
                                    <th>Role</th>
                                </tr>
                            </thead>
                            <tbody>`;

            if (students.length === 0) {
                html += `<tr><td colspan="5" class="text-center">No students found</td></tr>`;
            } else {
                students.forEach(student => {
                    html += `
                    <tr>
                        <td>${student.student_id}</td>
                        <td>${student.name}</td>
                        <td>${student.email}</td>
                        <td>${new Date(student.dob).toLocaleDateString()}</td>
                        <td>
                            <span class="badge ${student.role_id === 1 ? 'bg-primary' : 'bg-success'}">
                                ${student.role_name.replace('_', ' ').toUpperCase()}
                            </span>
                        </td>
                    </tr>`;
                });
            }

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;

            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading students:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading students: ${error.message}</div>`;
        });
}

function showCreateStudentModal() {
    const modal = new bootstrap.Modal(document.getElementById('studentModal'));
    document.getElementById('studentForm').reset();
    modal.show();
}

function createStudent() {
    const name = document.getElementById('studentName').value;
    const email = document.getElementById('studentEmail').value;
    const dob = document.getElementById('studentDob').value;
    const role_id = document.querySelector('input[name="studentRole"]:checked').value;

    if (!name || !email || !dob) {
        alert('Please fill in all required fields.');
        return;
    }

    const createButton = document.querySelector('#studentModal .btn-primary');
    createButton.disabled = true;
    createButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Creating Account...';

    fetch('/api/admin/create-student', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'user-role': localStorage.getItem('userRole'),
            'user-id': localStorage.getItem('userId')
        },
        body: JSON.stringify({ name, email, dob, role_id })
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                bootstrap.Modal.getInstance(document.getElementById('studentModal')).hide();

                const contentArea = document.getElementById('contentArea');
                const successAlert = `
                <div class="alert alert-success alert-dismissible fade show" role="alert">
                    <i class="bi bi-check-circle-fill"></i>
                    <strong>Success!</strong> Student account created successfully!
                    <hr>
                    <div class="mb-0">
                        <strong>Student Details:</strong><br>
                        <small>
                            • Name: ${name}<br>
                            • Email: ${email}<br>
                            • Role: ${role_id === '1' ? 'Regular Student' : 'Student Advisor'}<br>
                            • Temporary Password: <code>${result.tempPassword}</code><br>
                            • Login credentials have been sent to the student's email
                        </small>
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
                <hr>
            `;

                contentArea.innerHTML = successAlert + contentArea.innerHTML;

                setTimeout(() => {
                    loadStudentManagement();
                }, 15000);
            } else {
                alert('Failed to create student account: ' + result.message);
            }
        })
        .catch(error => {
            console.error('Error creating student:', error);
            alert('Failed to create student account: ' + error.message);
        })
        .finally(() => {
            createButton.disabled = false;
            createButton.innerHTML = '<i class="bi bi-person-plus"></i> Create Student Account';
        });
}

function renderTopCoursesOnly(contentArea, topCourses) {
    let html = `
        <div class="card">
            <div class="card-header bg-primary text-white">
                <h5 class="mb-0">
                    <i class="bi bi-graph-up"></i> Top 5 Courses by Enrollment
                </h5>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Course Name</th>
                                <th>Professor</th>
                                <th>Department</th>
                                <th>Enrolled Students</th>
                            </tr>
                        </thead>
                        <tbody>`;

    if (topCourses.length === 0) {
        html += '<tr><td colspan="4" class="text-center">No data available</td></tr>';
    } else {
        topCourses.forEach(row => {
            html += `
                <tr>
                    <td><strong>${row.course_name}</strong></td>
                    <td>${row.professor_name}</td>
                    <td>${row.department_name || 'N/A'}</td>
                    <td class="text-center">
                        <span class="badge bg-primary rounded-pill">${row.enrollment_count}</span>
                    </td>
                </tr>`;
        });
    }

    html += `
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <div class="alert alert-info mt-3" role="alert">
            <i class="bi bi-info-circle"></i>
            <strong>Limited Access:</strong> Additional analytics are available for administrative staff only.
        </div>`;

    contentArea.innerHTML = html;
}

function loadAnalyticsReport() {
    setActiveNavItem('analyticsReport');
    const contentArea = document.getElementById('contentArea');
    const userRole = localStorage.getItem('userRole');

    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';

    if (userRole !== 'administrative_staff') {
        fetch('/api/analytics/top-courses')
            .then(response => response.json())
            .then(topCourses => {
                renderTopCoursesOnly(contentArea, topCourses);
            })
            .catch(error => {
                console.error('Error loading analytics:', error);
                contentArea.innerHTML = `
                    <div class="alert alert-danger" role="alert">
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        <strong>Error loading analytics:</strong> ${error.message}
                    </div>`;
            });
        return;
    }

    Promise.all([
        fetch('/api/analytics/top-courses'),
        fetch('/api/analytics/recent-students', {
            headers: {
                'user-role': userRole
            }
        })
    ])
        .then(responses => Promise.all(responses.map(r => {
            if (!r.ok) {
                throw new Error(`HTTP error! status: ${r.status}`);
            }
            return r.json();
        })))
        .then(([topCourses, recentStudents]) => {
            let html = `
            <div class="card mb-4">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">
                        <i class="bi bi-graph-up"></i> Top 5 Courses by Enrollment
                    </h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Course Name</th>
                                    <th>Professor</th>
                                    <th>Department</th>
                                    <th>Enrolled Students</th>
                                </tr>
                            </thead>
                            <tbody>`;

            if (topCourses.length === 0) {
                html += '<tr><td colspan="4" class="text-center">No data available</td></tr>';
            } else {
                topCourses.forEach(row => {
                    html += `
                    <tr>
                        <td><strong>${row.course_name}</strong></td>
                        <td>${row.professor_name}</td>
                        <td>${row.department_name || 'N/A'}</td>
                        <td class="text-center">
                            <span class="badge bg-primary rounded-pill">${row.enrollment_count}</span>
                        </td>
                    </tr>`;
                });
            }

            html += `</tbody></table></div></div></div>`;

            html += `
            <div class="card">
                <div class="card-header bg-success text-white">
                    <h5 class="mb-0">
                        <i class="bi bi-person-plus-fill"></i> Last 5 Created Student Accounts
                    </h5>
                </div>
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Date of Birth</th>
                                    <th>Role</th>
                                    <th>Account Type</th>
                                    <th>Created</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>`;

            if (!recentStudents || recentStudents.length === 0) {
                html += '<tr><td colspan="8" class="text-center">No student accounts found</td></tr>';
            } else {
                recentStudents.forEach((student, index) => {
                    const dob = new Date(student.dob).toLocaleDateString();
                    const roleColor = student.role_name.includes('Advisor') ? 'success' : 'primary';
                    const statusColor = student.creation_status === 'New' ? 'warning' :
                        student.creation_status === 'Recent' ? 'info' : 'success';

                    const rowClass = index % 2 === 0 ? '' : 'table-light';

                    let createdDisplay = `#${student.student_id}`;
                    if (student.created_at) {
                        const createdDate = new Date(student.created_at);
                        createdDisplay = createdDate.toLocaleDateString() + ' ' + createdDate.toLocaleTimeString();
                    }

                    html += `
                    <tr class="${rowClass}">
                        <td>
                            <span class="badge bg-secondary">#${student.student_id}</span>
                        </td>
                        <td><strong>${student.name}</strong></td>
                        <td>
                            <a href="mailto:${student.email}" class="text-decoration-none">
                                ${student.email}
                            </a>
                        </td>
                        <td>${dob}</td>
                        <td>
                            <span class="badge bg-${roleColor}">
                                ${student.role_name}
                            </span>
                        </td>
                        <td>
                            <span class="badge bg-secondary">
                                ${student.account_type}
                            </span>
                        </td>
                        <td>
                            <small>${createdDisplay}</small>
                        </td>
                        <td>
                            <span class="badge bg-${statusColor}">
                                ${student.creation_status}
                            </span>
                        </td>
                    </tr>`;
                });
            }

            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading analytics report:', error);
            contentArea.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="bi bi-exclamation-triangle-fill"></i>
                <strong>Error loading analytics:</strong> ${error.message}
                <br>
                <small>Please try refreshing the page or contact support if the problem persists.</small>
            </div>`;
        });
}

function openCourseModal(course = null) {
    const modal = new bootstrap.Modal(document.getElementById('courseModal'));
    const form = document.getElementById('courseForm');
    form.reset();

    if (course) {
        document.getElementById('courseModalTitle').textContent = 'Edit Course';
        document.getElementById('courseId').value = course.course_id;
        document.getElementById('courseName').value = course.course_name;
        document.getElementById('credits').value = course.credits;
        document.getElementById('seatsAvailable').value = course.seats_available;
    } else {
        document.getElementById('courseModalTitle').textContent = 'Add Course';
        document.getElementById('courseId').value = '';
    }

    modal.show();
}

function saveCourse() {
    const courseId = document.getElementById('courseId').value;
    const courseData = {
        course_name: document.getElementById('courseName').value,
        credits: document.getElementById('credits').value,
        seats_available: document.getElementById('seatsAvailable').value,
        professor_id: localStorage.getItem('userId')
    };

    let url = '/api/courses';
    let method = 'POST';

    if (courseId) {
        url += `/${courseId}`;
        method = 'PUT';
    }

    fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(courseData)
    })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                bootstrap.Modal.getInstance(document.getElementById('courseModal')).hide();
                loadAvailableCourses();
            } else {
                alert('Failed to save course: ' + result.message);
            }
        })
        .catch(error => {
            console.error('Error saving course:', error);
            alert('Failed to save course: ' + error.message);
        });
}

function editCourse(courseId) {
    fetch(`/api/courses/${courseId}`)
        .then(response => response.json())
        .then(course => {
            openCourseModal(course);
        })
        .catch(error => {
            console.error('Error fetching course details:', error);
            alert('Failed to load course details: ' + error.message);
        });
}

function deleteCourse(courseId) {
    if (confirm('Are you sure you want to delete this course?')) {
        fetch(`/api/courses/${courseId}`, {
            method: 'DELETE'
        })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    loadAvailableCourses();
                } else {
                    alert('Failed to delete course: ' + result.message);
                }
            })
            .catch(error => {
                console.error('Error deleting course:', error);
                alert('Failed to delete course: ' + error.message);
            });
    }
}

function setActiveNavItem(id) {
    document.querySelectorAll('.nav-link').forEach(item => {
        item.classList.remove('active');
    });

    document.getElementById(id).classList.add('active');
}