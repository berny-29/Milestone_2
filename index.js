require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const { faker } = require('@faker-js/faker');
const nodemailer = require('nodemailer');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

const { initResetRoutes } = require('./database-reset');
initResetRoutes(app);

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

app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
});