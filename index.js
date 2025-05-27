require('dotenv').config();

const { initResetRoutes } = require('./database-reset');
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const { faker } = require('@faker-js/faker');
const app = express();
initResetRoutes(app);
const port = 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const nodemailer = require('nodemailer');

async function createTestTransporter() {
    const testAccount = await nodemailer.createTestAccount();

    return nodemailer.createTransporter({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass
        }
    });
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    database: process.env.DB_NAME || 'university',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function generateTempPassword(length = 10) {
    const mysql = require('mysql2/promise');
    const path = require('path');
    const { faker } = require('@faker-js/faker');
    const app = express();
    initResetRoutes(app);
    const port = 3000;
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));
    const nodemailer = require('nodemailer');

    async function createTestTransporter() {
        const testAccount = await nodemailer.createTestAccount();

        return nodemailer.createTransporter({
            host: 'smtp.ethereal.email',
            port: 587,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
    }

    const pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        database: process.env.DB_NAME || 'university',
        password: process.env.DB_PASSWORD || 'password',
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    const { initResetRoutes } = require('./database-reset');
    const express = require('express');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

function isAdminStaff(req, res, next) {
    const userRole = req.headers['user-role'];
    const userId = req.headers['user-id'];

    if (!userRole || !userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (userRole !== 'administrative_staff') {
        return res.status(403).json({ success: false, message: 'Administrative staff access required' });
    }

    next();
}

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

app.post('/api/register', async (req, res) => {
    const { name, email, password, dob, role_id } = req.body;

    try {
        const [studentExists] = await pool.query('SELECT * FROM STUDENT WHERE email = ?', [email]);
        const [professorExists] = await pool.query('SELECT * FROM PROFESSOR WHERE email = ?', [email]);

        if (studentExists.length > 0 || professorExists.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        if (role_id === '3') {
            const [result] = await pool.query(
                'INSERT INTO PROFESSOR (name, email) VALUES (?, ?)',
                [name, email]
            );
            const professorId = result.insertId;
            await pool.query(
                'INSERT INTO PROFESSOR_ACCOUNT (professor_id, password, account_type) VALUES (?, ?, ?)',
                [professorId, password, 'regular']
            );
            res.json({ success: true, message: 'Professor account registered successfully!' });
        } else if (role_id === '4') {
            const [result] = await pool.query(
                'INSERT INTO PROFESSOR (name, email) VALUES (?, ?)',
                [name, email]
            );
            const professorId = result.insertId;
            await pool.query(
                'INSERT INTO PROFESSOR_ACCOUNT (professor_id, password, account_type) VALUES (?, ?, ?)',
                [professorId, password, 'admin']
            );
            res.json({ success: true, message: 'Administrative staff account registered successfully!' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid role selected. Only staff registration is allowed.' });
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

app.post('/api/admin/create-student', async (req, res) => {
    const { name, email, dob, role_id } = req.body;

    const userRole = req.headers['user-role'];

    if (userRole !== 'administrative_staff') {
        return res.status(403).json({ success: false, message: 'Administrative staff access required' });
    }

    try {
        const [studentExists] = await pool.query('SELECT * FROM STUDENT WHERE email = ?', [email]);
        const [professorExists] = await pool.query('SELECT * FROM PROFESSOR WHERE email = ?', [email]);

        if (studentExists.length > 0 || professorExists.length > 0) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }

        if (role_id !== '1' && role_id !== '2') {
            return res.status(400).json({ success: false, message: 'Invalid student role selected' });
        }

        const tempPassword = generateTempPassword();

        const [result] = await pool.query(
            'INSERT INTO STUDENT (name, email, dob, role_id) VALUES (?, ?, ?, ?)',
            [name, email, dob, role_id]
        );
        const studentId = result.insertId;

        await pool.query(
            'INSERT INTO STUDENT_ACCOUNT (student_id, password, account_type) VALUES (?, ?, ?)',
            [studentId, tempPassword, 'regular']
        );

        const { sendStudentCredentials } = require('./mailer');
        await sendStudentCredentials(email, name, tempPassword);

        res.json({
            success: true,
            message: 'Student account created successfully!',
            studentId: studentId,
            tempPassword: tempPassword
        });
    } catch (err) {
        console.error('Student creation error:', err);
        res.status(500).json({ success: false, message: 'Server error during student creation' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [studentRows] = await pool.query(
            `SELECT s.student_id as id, s.name, s.email, s.role_id, sa.password
             FROM STUDENT s
             JOIN STUDENT_ACCOUNT sa ON s.student_id = sa.student_id
             WHERE s.email = ?`,
            [email]
        );

        if (studentRows.length > 0) {
            const student = studentRows[0];
            if (password !== student.password) {
                return res.status(401).json({ success: false, message: 'Invalid password' });
            }

            return res.json({
                success: true,
                userId: student.id,
                name: student.name,
                email: student.email,
                roleId: student.role_id
            });
        }

        const [profRows] = await pool.query(
            `SELECT p.professor_id as id, p.name, p.email, pa.password, pa.account_type
             FROM PROFESSOR p
             JOIN PROFESSOR_ACCOUNT pa ON p.professor_id = pa.professor_id
             WHERE p.email = ?`,
            [email]
        );

        if (profRows.length > 0) {
            const prof = profRows[0];
            if (password !== prof.password) {
                return res.status(401).json({ success: false, message: 'Invalid password' });
            }

            const roleId = prof.account_type === 'admin' ? 4 : 3;

            return res.json({
                success: true,
                userId: prof.id,
                name: prof.name,
                email: prof.email,
                roleId: roleId
            });
        }

        return res.status(404).json({ success: false, message: 'User not found' });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/courses', async (req, res) => {
    try {
        const { student_id, professor_id } = req.query;

        if (student_id) {
            const [courses] = await pool.query(`
                SELECT 
                    c.course_id,
                    c.course_name,
                    c.credits,
                    c.seats_available,
                    EXISTS (
                        SELECT 1 FROM ENROLLMENT e 
                        WHERE e.course_id = c.course_id AND e.student_id = ?
                    ) AS is_enrolled
                FROM COURSE c
            `, [student_id]);

            return res.json(courses);
        }

        if (professor_id) {
            const [courses] = await pool.query(`
                SELECT 
                    course_id,
                    course_name,
                    credits,
                    seats_available
                FROM COURSE
                WHERE professor_id = ?
            `, [professor_id]);

            return res.json(courses);
        }

        const [allCourses] = await pool.query('SELECT * FROM COURSE');
        res.json(allCourses);
    } catch (err) {
        console.error('Error fetching courses:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/courses/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.*
            FROM COURSE c
            WHERE c.course_id = ?
        `, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Course not found' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching course:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/students', async (req, res) => {
    const professorId = req.params.id;

    try {
        const [rows] = await pool.query(`
            SELECT 
                s.name AS student_name,
                s.email,
                c.course_name
            FROM ENROLLMENT e
            JOIN STUDENT s ON e.student_id = s.student_id
            JOIN COURSE c ON e.course_id = c.course_id
            WHERE c.professor_id = ?
        `, [professorId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching professor\'s students:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/courses', async (req, res) => {
    try {
        const { course_name, credits, seats_available, professor_id } = req.body;

        const [result] = await pool.query(`
            INSERT INTO COURSE (course_name, credits, seats_available, professor_id)
            VALUES (?, ?, ?, ?)
        `, [course_name, credits, seats_available, professor_id]);

        if (professor_id) {
            await pool.query(`
                INSERT INTO teaches (professor_id, course_id)
                VALUES (?, ?)
            `, [professor_id, result.insertId]);
        }

        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Error creating course:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.put('/api/courses/:id', async (req, res) => {
    try {
        const { course_name, credits, seats_available, professor_id } = req.body;

        await pool.query(`
            UPDATE COURSE
            SET course_name = ?, credits = ?, seats_available = ?
            WHERE course_id = ?
        `, [course_name, credits, seats_available, req.params.id]);

        if (professor_id) {
            const [existing] = await pool.query(`
                SELECT * FROM teaches WHERE professor_id = ? AND course_id = ?
            `, [professor_id, req.params.id]);

            if (existing.length === 0) {
                await pool.query(`
                    INSERT INTO teaches (professor_id, course_id)
                    VALUES (?, ?)
                `, [professor_id, req.params.id]);
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating course:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM teaches WHERE course_id = ?', [req.params.id]);
        await pool.query('DELETE FROM ENROLLMENT WHERE course_id = ?', [req.params.id]);
        await pool.query('DELETE FROM COURSE WHERE course_id = ?', [req.params.id]);

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting course:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

const { sendEnrollmentConfirmation } = require('./mailer');

app.post('/api/enrollments', async (req, res) => {
    try {
        const { student_id, course_id } = req.body;

        const [existing] = await pool.query(`
            SELECT * FROM ENROLLMENT WHERE student_id = ? AND course_id = ?
        `, [student_id, course_id]);

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Student already enrolled in this course' });
        }

        const [courseRows] = await pool.query(`
            SELECT course_name, seats_available, 
                   (SELECT COUNT(*) FROM ENROLLMENT WHERE course_id = ?) as enrolled
            FROM COURSE WHERE course_id = ?
        `, [course_id, course_id]);

        if (courseRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        const course = courseRows[0];

        if (course.enrolled >= course.seats_available) {
            return res.status(400).json({ success: false, message: 'No seats available' });
        }

        const [insertResult] = await pool.query(`
            INSERT INTO ENROLLMENT (student_id, course_id)
            VALUES (?, ?)
        `, [student_id, course_id]);

        await pool.query(`
            UPDATE COURSE
            SET seats_available = GREATEST(seats_available - 1, 0)
            WHERE course_id = ?
        `, [course_id]);

        const [[student]] = await pool.query(`
            SELECT name, email FROM STUDENT WHERE student_id = ?
        `, [student_id]);

        await sendEnrollmentConfirmation(student.email, student.name, course.course_name);

        res.json({ success: true, id: insertResult.insertId });

    } catch (err) {
        console.error('Error creating enrollment:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.delete('/api/enrollments/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT course_id FROM ENROLLMENT WHERE enrollment_id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Enrollment not found' });
        }

        const courseId = rows[0].course_id;

        await pool.query('DELETE FROM ENROLLMENT WHERE enrollment_id = ?', [req.params.id]);

        await pool.query(
            'UPDATE COURSE SET seats_available = seats_available + 1 WHERE course_id = ?',
            [courseId]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting enrollment:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.put('/api/enrollments/:id/grade', async (req, res) => {
    try {
        const { grade } = req.body;

        await pool.query(`
            UPDATE ENROLLMENT SET grade = ? WHERE enrollment_id = ?
        `, [grade, req.params.id]);

        res.json({ success: true });
    } catch (err) {
        console.error('Error updating grade:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/analytics/top-courses', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                c.course_name,
                p.name AS professor_name,
                d.name AS department_name,
                COUNT(e.enrollment_id) AS enrollment_count
            FROM COURSE c
            JOIN PROFESSOR p ON c.professor_id = p.professor_id
            LEFT JOIN PROFESSOR_DEPARTMENT pd ON p.professor_id = pd.professor_id
            LEFT JOIN DEPARTMENT d ON pd.department_id = d.department_id
            LEFT JOIN ENROLLMENT e ON c.course_id = e.course_id
            GROUP BY c.course_id
            ORDER BY enrollment_count DESC
            LIMIT 5
        `);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching analytics report:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

app.get('/api/students/:id/courses', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT e.*, c.course_name, c.credits, c.seats_available
            FROM ENROLLMENT e
            JOIN COURSE c ON e.course_id = c.course_id
            WHERE e.student_id = ?
        `, [req.params.id]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching student courses:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/students/:id/advisors', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT s.student_id, s.name, s.email, s.dob, sd.department_id, d.name as department_name
            FROM STUDENT s
            LEFT JOIN STUDENT_DEPARTMENT sd ON s.student_id = sd.student_id
            LEFT JOIN DEPARTMENT d ON sd.department_id = d.department_id
            WHERE s.student_id = (SELECT advisor_id FROM STUDENT WHERE student_id = ?)
              AND s.role_id = 2
        `, [req.params.id]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching student advisors:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/courses', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM ENROLLMENT WHERE course_id = c.course_id) as enrolled_count
            FROM COURSE c
            JOIN teaches t ON c.course_id = t.course_id
            WHERE t.professor_id = ?
        `, [req.params.id]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching professor courses:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/department', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT d.*
            FROM PROFESSOR_DEPARTMENT pd
            JOIN DEPARTMENT d ON pd.department_id = d.department_id
            WHERE pd.professor_id = ?
        `, [req.params.id]);

        if (rows.length === 0) {
            return res.json({ message: 'Professor not assigned to any department' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching professor department:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/advisees', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT s.*
            FROM STUDENT s
            JOIN advises a ON s.student_id = a.student_id
            WHERE a.professor_id = ?
        `, [req.params.id]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching professor advisees:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/courses/:id/enrollments', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT e.*, s.name as student_name, s.email
            FROM ENROLLMENT e
            JOIN STUDENT s ON e.student_id = s.student_id
            WHERE e.course_id = ?
        `, [req.params.id]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching course enrollments:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/departments', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM DEPARTMENT');
        res.json(rows);
    } catch (err) {
        console.error('Error fetching departments:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/admin/students', async (req, res) => {
    const userRole = req.headers['user-role'];

    if (userRole !== 'administrative_staff') {
        return res.status(403).json({ success: false, message: 'Administrative staff access required' });
    }

    try {
        const [rows] = await pool.query(`
            SELECT s.student_id, s.name, s.email, s.dob, r.role_name, s.role_id
            FROM STUDENT s
            JOIN ROLE r ON s.role_id = r.role_id
            WHERE s.role_id IN (1, 2)
            ORDER BY s.student_id DESC
        `);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/generate-data', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query('DELETE FROM ENROLLMENT');
        await connection.query('DELETE FROM STUDENT_ACCOUNT');
        await connection.query('DELETE FROM STUDENT_DEPARTMENT');
        await connection.query('DELETE FROM PROFESSOR_DEPARTMENT');
        await connection.query('DELETE FROM teaches');
        await connection.query('DELETE FROM COURSE');
        await connection.query('DELETE FROM STUDENT');
        await connection.query('DELETE FROM PROFESSOR');
        await connection.query('DELETE FROM DEPARTMENT');
        await connection.query('DELETE FROM ROLE');

        await connection.query(`
            INSERT INTO ROLE (role_id, role_name)
            VALUES 
                (1, 'student'),
                (2, 'student_advisor'),
                (3, 'professor'),
                (4, 'administrative_staff')
        `);

        const departments = ['Computer Science', 'Mathematics', 'Physics', 'Business', 'Arts'];
        const locations = ['Building A', 'Building B', 'Building C', 'Building D', 'Building E'];

        for (let i = 0; i < departments.length; i++) {
            await connection.query(
                'INSERT INTO DEPARTMENT (department_id, name, location) VALUES (?, ?, ?)',
                [i + 1, departments[i], locations[i]]
            );
        }

        const [deptRows] = await connection.query('SELECT department_id FROM DEPARTMENT');
        const departmentIds = deptRows.map(row => row.department_id);

        for (let i = 0; i < 10; i++) {
            const deptId = departmentIds[Math.floor(Math.random() * departmentIds.length)];
            const name = faker.person.fullName();
            const email = faker.internet.email();

            const [profResult] = await connection.query(
                'INSERT INTO PROFESSOR (professor_id, name, email) VALUES (?, ?, ?)',
                [i + 1, name, email]
            );

            await connection.query(
                'INSERT INTO PROFESSOR_DEPARTMENT (professor_id, department_id) VALUES (?, ?)',
                [i + 1, deptId]
            );
        }

        const professorIds = Array.from({ length: 10 }, (_, i) => i + 1);

        const testName = 'Test Student';
        const testEmail = 'test@student.com';
        const testDob = '2000-01-01';
        const testPassword = 'password123';
        const testRoleId = 1;
        const testStudentId = 1;
        const testDeptId = departmentIds[0];

        await connection.query(
            'INSERT INTO STUDENT (student_id, name, email, dob, advisor_id, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            [testStudentId, testName, testEmail, testDob, null, testRoleId]
        );

        await connection.query(
            'INSERT INTO STUDENT_ACCOUNT (account_id, student_id, password, account_type) VALUES (?, ?, ?, ?)',
            [1, testStudentId, testPassword, 'regular']
        );

        await connection.query(
            'INSERT INTO STUDENT_DEPARTMENT (student_id, department_id) VALUES (?, ?)',
            [testStudentId, testDeptId]
        );

        for (let i = 1; i < 50; i++) {
            const name = faker.person.fullName();
            const email = faker.internet.email();
            const dob = faker.date.past({ years: 20, refDate: new Date(2002, 0, 1) }).toISOString().split('T')[0];
            const roleId = 1;

            await connection.query(
                'INSERT INTO STUDENT (student_id, name, email, dob, advisor_id, role_id) VALUES (?, ?, ?, ?, ?, ?)',
                [i + 1, name, email, dob, null, roleId]
            );

            await connection.query(
                'INSERT INTO STUDENT_ACCOUNT (account_id, student_id, password, account_type) VALUES (?, ?, ?, ?)',
                [i + 1, i + 1, 'password123', 'regular']
            );

            const deptId = departmentIds[Math.floor(Math.random() * departmentIds.length)];
            await connection.query(
                'INSERT INTO STUDENT_DEPARTMENT (student_id, department_id) VALUES (?, ?)',
                [i + 1, deptId]
            );
        }

        const studentIds = Array.from({ length: 50 }, (_, i) => i + 1);

        for (let i = 0; i < 20; i++) {
            const courseId = i + 1;
            const courseName = faker.word.words(3) + ' ' + faker.number.int(400);
            const credits = Math.floor(Math.random() * 5) + 2;
            const seatsAvailable = 20 + Math.floor(Math.random() * 30);
            const profId = professorIds[Math.floor(Math.random() * professorIds.length)];

            const [profDept] = await connection.query('SELECT department_id FROM PROFESSOR_DEPARTMENT WHERE professor_id = ? LIMIT 1', [profId]);
            const deptId = profDept[0].department_id;

            await connection.query(
                'INSERT INTO COURSE (course_id, course_name, credits, seats_available, professor_id) VALUES (?, ?, ?, ?, ?)',
                [courseId, courseName, credits, seatsAvailable, profId]
            );
        }

        const courseIds = Array.from({ length: 20 }, (_, i) => i + 1);

        for (let i = 0; i < 100; i++) {
            const enrollmentId = i + 1;
            const studentId = studentIds[Math.floor(Math.random() * studentIds.length)];
            const courseId = courseIds[Math.floor(Math.random() * courseIds.length)];

            const [exists] = await connection.query('SELECT COUNT(*) as count FROM ENROLLMENT WHERE student_id = ? AND course_id = ?', [studentId, courseId]);
            if (exists[0].count > 0) continue;

            const enrollmentDate = faker.date.past({ years: 1 }).toISOString().split('T')[0];
            const grade = Math.random() < 0.7 ? ['A', 'B', 'C', 'D', 'F'][Math.floor(Math.random() * 5)] : null;

            await connection.query(
                'INSERT INTO ENROLLMENT (enrollment_id, student_id, course_id, grade) VALUES (?, ?, ?, ?)',
                [enrollmentId, studentId, courseId, grade]
            );
        }

        await connection.commit();

        res.json({ success: true, message: 'Random data generated successfully' });
    } catch (err) {
        await connection.rollback();
        console.error('Error generating random data:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        connection.release();
    }
});

app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
});