document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const userRole = localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('userName');
    
    if (!userRole || !userId) {
        // Not logged in, redirect to login page
        window.location.href = '/login.html';
        return;
    }
    
    // Set user name in navbar
    document.getElementById('userName').textContent = userName;
    
    // Show/hide elements based on role
    if (userRole === 'student') {
        document.querySelectorAll('.professor-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.student-only').forEach(el => el.style.display = 'block');
    } else if (userRole === 'professor') {
        document.querySelectorAll('.student-only').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.professor-only').forEach(el => el.style.display = 'block');
    }
    
    // Load initial content (Available Courses by default)
    loadAvailableCourses();
    
    // Set up event listeners
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('allCourses').addEventListener('click', loadAvailableCourses);
    
    if (userRole === 'student') {
        document.getElementById('myCourses').addEventListener('click', loadEnrolledCourses);
        document.getElementById('myAdvisors').addEventListener('click', loadAdvisors);
        document.getElementById('confirmEnrollBtn').addEventListener('click', enrollInCourse);
    } else if (userRole === 'professor') {
        document.getElementById('myTeachingCourses').addEventListener('click', loadTeachingCourses);
        document.getElementById('departmentManagement').addEventListener('click', loadDepartmentInfo);
        document.getElementById('myAdvisees').addEventListener('click', loadAdvisees);
        document.getElementById('generateDataBtn').addEventListener('click', generateRandomData);
        document.getElementById('saveCourseBtn').addEventListener('click', saveCourse);
    }
});

function logout() {
    // Clear local storage and redirect to login
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('userName');
    localStorage.removeItem('userEmail');
    window.location.href = '/login.html';
}

// Available Courses (for both students and professors)
async function loadAvailableCourses() {
    setActiveNavItem('allCourses');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';
    
    try {
        const response = await fetch('/api/courses');
        const courses = await response.json();
        
        let html = `
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Available Courses</h5>
                    ${localStorage.getItem('userRole') === 'professor' ? 
                      '<button class="btn btn-sm btn-primary" onclick="openCourseModal()"><i class="bi bi-plus-circle"></i> Add Course</button>' : ''}
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
                                    <th>Department</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>`;
        
        if (courses.length === 0) {
            html += `<tr><td colspan="6" class="text-center">No courses available</td></tr>`;
        } else {
            courses.forEach(course => {
                html += `
                    <tr>
                        <td>${course.course_id}</td>
                        <td>${course.course_name}</td>
                        <td>${course.credits}</td>
                        <td>${course.seats_available}</td>
                        <td>${course.department_name || 'N/A'}</td>
                        <td>`;
                
                if (localStorage.getItem('userRole') === 'student') {
                    html += `<button class="btn btn-sm btn-success" onclick="openEnrollmentModal(${course.course_id}, '${course.course_name}')">
                                <i class="bi bi-plus-circle"></i> Enroll
                            </button>`;
                } else if (localStorage.getItem('userRole') === 'professor') {
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
        
        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        
        contentArea.innerHTML = html;
    } catch (error) {
        console.error('Error loading courses:', error);
        contentArea.innerHTML = `<div class="alert alert-danger">Error loading courses: ${error.message}</div>`;
    }
}

// Student-specific functions
function loadEnrolledCourses() {
    setActiveNavItem('myCourses');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';
    
    const studentId = localStorage.getItem('userId');
    
    fetch(`/api/students/${studentId}/courses`)
        .then(response => response.json())
        .then(enrollments => {
            let html = `
                <div class="card">
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
                                        <th>Enrollment Date</th>
                                        <th>Grade</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>`;
            
            if (enrollments.length === 0) {
                html += `<tr><td colspan="5" class="text-center">You are not enrolled in any courses</td></tr>`;
            } else {
                enrollments.forEach(enrollment => {
                    html += `
                        <tr>
                            <td>${enrollment.course_name}</td>
                            <td>${enrollment.credits}</td>
                            <td>${new Date(enrollment.enrollment_date).toLocaleDateString()}</td>
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
                        <h5 class="mb-0">My Advisors</h5>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Advisor Name</th>
                                        <th>Email</th>
                                        <th>Department</th>
                                    </tr>
                                </thead>
                                <tbody>`;
            
            if (advisors.length === 0) {
                html += `<tr><td colspan="3" class="text-center">You don't have any advisors assigned</td></tr>`;
            } else {
                advisors.forEach(advisor => {
                    html += `
                        <tr>
                            <td>${advisor.name}</td>
                            <td>${advisor.email}</td>
                            <td>${advisor.department_name || 'N/A'}</td>
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
            console.error('Error loading advisors:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading advisors: ${error.message}</div>`;
        });
}

function openEnrollmentModal(courseId, courseName) {
    const modal = new bootstrap.Modal(document.getElementById('enrollmentModal'));
    document.getElementById('enrollCourseId').value = courseId;
    document.getElementById('enrollCourseTitle').textContent = courseName;
    modal.show();
}

function enrollInCourse() {
    const courseId = document.getElementById('enrollCourseId').value;
    const studentId = localStorage.getItem('userId');
    
    fetch('/api/enrollments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            student_id: studentId,
            course_id: courseId,
            enrollment_date: new Date().toISOString().split('T')[0]
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            // Hide modal and reload available courses
            bootstrap.Modal.getInstance(document.getElementById('enrollmentModal')).hide();
            
            // Show success message
            const contentArea = document.getElementById('contentArea');
            contentArea.innerHTML = `
                <div class="alert alert-success alert-dismissible fade show" role="alert">
                    Successfully enrolled in the course!
                    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
                </div>
            ` + contentArea.innerHTML;
            
            // Reload courses after a short delay
            setTimeout(() => {
                loadAvailableCourses();
            }, 1000);
        } else {
            alert('Enrollment failed: ' + result.message);
        }
    })
    .catch(error => {
        console.error('Error during enrollment:', error);
        alert('Enrollment failed: ' + error.message);
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

// Professor-specific functions
function loadTeachingCourses() {
    setActiveNavItem('myTeachingCourses');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';
    
    const professorId = localStorage.getItem('userId');
    
    fetch(`/api/professors/${professorId}/courses`)
        .then(response => response.json())
        .then(courses => {
            let html = `
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">My Teaching Courses</h5>
                        <button class="btn btn-sm btn-primary" onclick="openCourseModal()">
                            <i class="bi bi-plus-circle"></i> Add Course
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Course Name</th>
                                        <th>Credits</th>
                                        <th>Seats Available</th>
                                        <th>Enrolled Students</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>`;
            
            if (courses.length === 0) {
                html += `<tr><td colspan="5" class="text-center">You are not teaching any courses</td></tr>`;
            } else {
                courses.forEach(course => {
                    html += `
                        <tr>
                            <td>${course.course_name}</td>
                            <td>${course.credits}</td>
                            <td>${course.seats_available}</td>
                            <td>${course.enrolled_count || 0}</td>
                            <td>
                                <button class="btn btn-sm btn-info me-1" onclick="viewEnrollments(${course.course_id})">
                                    <i class="bi bi-people"></i> Students
                                </button>
                                <button class="btn btn-sm btn-primary me-1" onclick="editCourse(${course.course_id})">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="deleteCourse(${course.course_id})">
                                    <i class="bi bi-trash"></i>
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
                </div>`;
            
            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading teaching courses:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading teaching courses: ${error.message}</div>`;
        });
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
            
            // Add department courses section if there's a department
            if (department.department_id) {
                html += `
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0">Department Courses</h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th>Course Name</th>
                                            <th>Credits</th>
                                            <th>Professor</th>
                                            <th>Enrolled Students</th>
                                        </tr>
                                    </thead>
                                    <tbody>`;
                
                if (!department.courses || department.courses.length === 0) {
                    html += `<tr><td colspan="4" class="text-center">No courses in this department</td></tr>`;
                } else {
                    department.courses.forEach(course => {
                        html += `
                            <tr>
                                <td>${course.course_name}</td>
                                <td>${course.credits}</td>
                                <td>${course.professor_name || 'Not assigned'}</td>
                                <td>${course.enrolled_count || 0}</td>
                            </tr>`;
                    });
                }
                
                html += `
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>`;
            }
            
            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading department info:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading department information: ${error.message}</div>`;
        });
}

function loadAdvisees() {
    setActiveNavItem('myAdvisees');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';
    
    const professorId = localStorage.getItem('userId');
    
    fetch(`/api/professors/${professorId}/advisees`)
        .then(response => response.json())
        .then(advisees => {
            let html = `
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">My Advisees</h5>
                        <button class="btn btn-sm btn-primary" onclick="showAddAdviseeModal()">
                            <i class="bi bi-person-plus"></i> Add Advisee
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Student Name</th>
                                        <th>Email</th>
                                        <th>Date of Birth</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>`;
            
            if (advisees.length === 0) {
                html += `<tr><td colspan="4" class="text-center">You don't have any advisees</td></tr>`;
            } else {
                advisees.forEach(advisee => {
                    html += `
                        <tr>
                            <td>${advisee.name}</td>
                            <td>${advisee.email}</td>
                            <td>${advisee.date_of_birth ? new Date(advisee.date_of_birth).toLocaleDateString() : 'N/A'}</td>
                            <td>
                                <button class="btn btn-sm btn-info me-1" onclick="viewStudentCourses(${advisee.student_id})">
                                    <i class="bi bi-journal-text"></i> Courses
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="removeAdvisee(${advisee.student_id})">
                                    <i class="bi bi-person-dash"></i> Remove
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
                </div>`;
            
            contentArea.innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading advisees:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading advisees: ${error.message}</div>`;
        });
}

function viewEnrollments(courseId) {
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '<div class="text-center p-3"><div class="spinner-border text-primary"></div></div>';
    
    fetch(`/api/courses/${courseId}/enrollments`)
        .then(response => response.json())
        .then(enrollments => {
            let html = `
                <div class="card">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">Enrolled Students</h5>
                        <button class="btn btn-sm btn-secondary" onclick="loadTeachingCourses()">
                            <i class="bi bi-arrow-left"></i> Back to My Courses
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr>
                                        <th>Student Name</th>
                                        <th>Email</th>
                                        <th>Enrollment Date</th>
                                        <th>Grade</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>`;
            
            if (enrollments.length === 0) {
                html += `<tr><td colspan="5" class="text-center">No students enrolled in this course</td></tr>`;
            } else {
                enrollments.forEach(enrollment => {
                    html += `
                        <tr>
                            <td>${enrollment.student_name}</td>
                            <td>${enrollment.email}</td>
                            <td>${new Date(enrollment.enrollment_date).toLocaleDateString()}</td>
                            <td>
                                <input type="text" class="form-control form-control-sm grade-input" 
                                    data-enrollment-id="${enrollment.enrollment_id}" 
                                    value="${enrollment.grade || ''}" 
                                    placeholder="Enter grade">
                            </td>
                            <td>
                                <button class="btn btn-sm btn-primary save-grade-btn" 
                                    data-enrollment-id="${enrollment.enrollment_id}">
                                    <i class="bi bi-save"></i> Save Grade
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
                </div>`;
            
            contentArea.innerHTML = html;
            
            // Add event listeners to save grade buttons
            document.querySelectorAll('.save-grade-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const enrollmentId = this.getAttribute('data-enrollment-id');
                    const gradeInput = document.querySelector(`.grade-input[data-enrollment-id="${enrollmentId}"]`);
                    saveGrade(enrollmentId, gradeInput.value);
                });
            });
        })
        .catch(error => {
            console.error('Error loading enrollments:', error);
            contentArea.innerHTML = `<div class="alert alert-danger">Error loading enrolled students: ${error.message}</div>`;
        });
}

function saveGrade(enrollmentId, grade) {
    fetch(`/api/enrollments/${enrollmentId}/grade`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ grade })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            alert('Grade saved successfully!');
        } else {
            alert('Failed to save grade: ' + result.message);
        }
    })
    .catch(error => {
        console.error('Error saving grade:', error);
        alert('Failed to save grade: ' + error.message);
    });
}

function openCourseModal(course = null) {
    const modal = new bootstrap.Modal(document.getElementById('courseModal'));
    const form = document.getElementById('courseForm');
    form.reset();
    
    // Load departments for the dropdown
    fetch('/api/departments')
        .then(response => response.json())
        .then(departments => {
            const departmentSelect = document.getElementById('departmentSelect');
            departmentSelect.innerHTML = '';
            
            departments.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.department_id;
                option.textContent = dept.name;
                departmentSelect.appendChild(option);
            });
            
            // Set form values if editing a course
            if (course) {
                document.getElementById('courseModalTitle').textContent = 'Edit Course';
                document.getElementById('courseId').value = course.course_id;
                document.getElementById('courseName').value = course.course_name;
                document.getElementById('credits').value = course.credits;
                document.getElementById('seatsAvailable').value = course.seats_available;
                
                if (course.department_id) {
                    document.getElementById('departmentSelect').value = course.department_id;
                }
            } else {
                document.getElementById('courseModalTitle').textContent = 'Add Course';
                document.getElementById('courseId').value = '';
            }
            
            modal.show();
        })
        .catch(error => {
            console.error('Error loading departments:', error);
            alert('Failed to load departments: ' + error.message);
        });
}

function saveCourse() {
    const courseId = document.getElementById('courseId').value;
    const courseData = {
        course_name: document.getElementById('courseName').value,
        credits: document.getElementById('credits').value,
        seats_available: document.getElementById('seatsAvailable').value,
        department_id: document.getElementById('departmentSelect').value,
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
            loadTeachingCourses();
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
                // Reload the current view
                if (document.getElementById('myTeachingCourses').classList.contains('active')) {
                    loadTeachingCourses();
                } else {
                    loadAvailableCourses();
                }
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

function generateRandomData() {
    const dataStatus = document.getElementById('dataStatus');
    dataStatus.textContent = 'Generating random data...';
    dataStatus.className = 'ms-2 text-warning';
    
    fetch('/api/generate-data', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            dataStatus.textContent = 'Data generated successfully!';
            dataStatus.className = 'ms-2 text-success';
            
            // Reload current view
            if (document.getElementById('myTeachingCourses').classList.contains('active')) {
                loadTeachingCourses();
            } else if (document.getElementById('departmentManagement').classList.contains('active')) {
                loadDepartmentInfo();
            } else if (document.getElementById('myAdvisees').classList.contains('active')) {
                loadAdvisees();
            } else {
                loadAvailableCourses();
            }
        } else {
            dataStatus.textContent = 'Error: ' + result.message;
            dataStatus.className = 'ms-2 text-danger';
        }
    })
    .catch(error => {
        console.error('Error generating data:', error);
        dataStatus.textContent = 'Error: ' + error.message;
        dataStatus.className = 'ms-2 text-danger';
    });
    
    // Clear status message after 5 seconds
    setTimeout(() => {
        dataStatus.textContent = '';
    }, 5000);
}

// Helper functions
function setActiveNavItem(id) {
    // Remove active class from all nav items
    document.querySelectorAll('.nav-link').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to selected item
    document.getElementById(id).classList.add('active');
}