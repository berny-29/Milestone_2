require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const { faker } = require('@faker-js/faker');
const nodemailer = require('nodemailer');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const fsPromises = require('fs').promises;

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

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/university';
let mongoDb = null;
let mongoClient = null;
let currentDbType = 'mariadb';

async function connectMongoDB() {
    try {
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        mongoDb = mongoClient.db();
        console.log('[Connected to MongoDB]');

        await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true });
        await mongoDb.collection('users').createIndex({ userId: 1 }, { unique: true });
        await mongoDb.collection('users').createIndex({ userType: 1 });
        await mongoDb.collection('courses').createIndex({ courseId: 1 }, { unique: true });
        await mongoDb.collection('enrollments').createIndex({ studentId: 1 });
        await mongoDb.collection('enrollments').createIndex({ courseId: 1 });
        await mongoDb.collection('enrollments').createIndex({ enrollmentId: 1 }, { unique: true });
        await mongoDb.collection('departments').createIndex({ departmentId: 1 }, { unique: true });

        return mongoDb;
    } catch (error) {
        console.error('[MongoDB connection error]:', error);
        throw error;
    }
}

async function saveDatabaseConfig() {
    console.log(`Database switched to ${currentDbType}`);
}

function generateTempPassword(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

async function getNextId(collectionType) {
    let prefix, filter, collection;
    switch(collectionType) {
        case 'student':
            prefix = 'STU';
            filter = { userType: 'student' };
            collection = 'users';
            break;
        case 'professor':
            prefix = 'PROF';
            filter = { userType: 'professor' };
            collection = 'users';
            break;
        case 'course':
            prefix = 'CS';
            filter = {};
            collection = 'courses';
            break;
        case 'enrollment':
            prefix = 'ENR';
            filter = {};
            collection = 'enrollments';
            break;
        case 'department':
            prefix = 'DEPT';
            filter = {};
            collection = 'departments';
            break;
        default:
            prefix = 'ID';
            filter = {};
            collection = collectionType;
    }

    const count = await mongoDb.collection(collection).countDocuments(filter);
    return `${prefix}${String(count + 1).padStart(prefix === 'ENR' ? 5 : 3, '0')}`;
}

function toMongoId(id, type) {
    if (!id) return null;
    if (typeof id === 'string' && id.match(/^[A-Z]+\d+$/)) {
        return id;
    }

    const prefixMap = {
        student: 'STU',
        professor: 'PROF',
        course: 'CS',
        enrollment: 'ENR',
        department: 'DEPT'
    };

    const prefix = prefixMap[type] || 'ID';
    const padding = prefix === 'ENR' ? 5 : 3;
    return `${prefix}${String(id).padStart(padding, '0')}`;
}

function fromMongoId(id) {
    if (!id) return null;
    if (typeof id === 'number') return id;
    return parseInt(id.replace(/[^\d]/g, '')) || 0;
}

const { initResetRoutes } = require('./database-reset');
initResetRoutes(app);

app.get('/', (req, res) => {
    res.redirect('/login.html');
});

app.get('/api/database-status', (req, res) => {
    res.json({
        success: true,
        currentDb: currentDbType,
        available: {
            mariadb: true,
            mongodb: !!mongoDb
        }
    });
});

app.get('/api/check-mongodb', async (req, res) => {
    try {
        if (!mongoDb) {
            await connectMongoDB();
        }
        await mongoDb.admin().ping();
        res.json({ success: true, message: 'MongoDB is connected' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/migrate-to-mongodb', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            return res.json({
                success: false,
                message: 'Already using MongoDB'
            });
        }

        if (!mongoDb) {
            await connectMongoDB();
        }

        const stats = await migrateToMongoDB();

        res.json({
            success: true,
            message: 'Migration completed successfully',
            stats: stats
        });
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.post('/api/switch-database', async (req, res) => {
    try {
        const { database } = req.body;

        if (database !== 'mariadb' && database !== 'mongodb') {
            return res.status(400).json({
                success: false,
                message: 'Invalid database type'
            });
        }

        currentDbType = database;
        await saveDatabaseConfig();

        res.json({
            success: true,
            message: `Switched to ${currentDbType}`,
            currentDb: currentDbType
        });
    } catch (error) {
        console.error('Switch database error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

async function migrateToMongoDB() {
    const stats = {
        departments: 0,
        students: 0,
        professors: 0,
        courses: 0,
        enrollments: 0
    };

    try {
        await mongoDb.collection('users').deleteMany({});
        await mongoDb.collection('courses').deleteMany({});
        await mongoDb.collection('enrollments').deleteMany({});
        await mongoDb.collection('departments').deleteMany({});

        const [departments] = await pool.query('SELECT * FROM DEPARTMENT');
        if (departments.length > 0) {
            const deptDocs = departments.map(dept => ({
                departmentId: toMongoId(dept.department_id, 'department'),
                name: dept.name,
                location: dept.location
            }));
            await mongoDb.collection('departments').insertMany(deptDocs);
            stats.departments = deptDocs.length;
        }

        const [students] = await pool.query(`
            SELECT s.*, sa.password, sa.account_type,
                   sd.department_id, d.name as dept_name, d.location as dept_location
            FROM STUDENT s
            JOIN STUDENT_ACCOUNT sa ON s.student_id = sa.student_id
            LEFT JOIN STUDENT_DEPARTMENT sd ON s.student_id = sd.student_id
            LEFT JOIN DEPARTMENT d ON sd.department_id = d.department_id
        `);

        if (students.length > 0) {
            const studentDocs = students.map(student => {
                const doc = {
                    userId: toMongoId(student.student_id, 'student'),
                    userType: 'student',
                    name: student.name,
                    email: student.email,
                    password: student.password,
                    accountType: student.account_type || 'regular',
                    dob: new Date(student.dob),
                    roleId: student.role_id,
                    advisorId: student.advisor_id ? toMongoId(student.advisor_id, 'student') : null,
                    enrolledCourses: [],
                    totalCredits: 0
                };

                if (student.department_id) {
                    doc.department = {
                        departmentId: toMongoId(student.department_id, 'department'),
                        name: student.dept_name,
                        location: student.dept_location
                    };
                }

                return doc;
            });
            await mongoDb.collection('users').insertMany(studentDocs);
            stats.students = studentDocs.length;
        }

        const [professors] = await pool.query(`
            SELECT p.*, pa.password, pa.account_type,
                   pd.department_id, d.name as dept_name, d.location as dept_location
            FROM PROFESSOR p
            JOIN PROFESSOR_ACCOUNT pa ON p.professor_id = pa.professor_id
            LEFT JOIN PROFESSOR_DEPARTMENT pd ON p.professor_id = pd.professor_id
            LEFT JOIN DEPARTMENT d ON pd.department_id = d.department_id
        `);

        if (professors.length > 0) {
            const profDocs = professors.map(prof => {
                const doc = {
                    userId: toMongoId(prof.professor_id, 'professor'),
                    userType: 'professor',
                    name: prof.name,
                    email: prof.email,
                    password: prof.password,
                    accountType: prof.account_type || 'regular',
                    roleId: prof.account_type === 'admin' ? 4 : 3,
                    teachingCourses: []
                };

                if (prof.department_id) {
                    doc.department = {
                        departmentId: toMongoId(prof.department_id, 'department'),
                        name: prof.dept_name,
                        location: prof.dept_location
                    };
                }

                return doc;
            });
            await mongoDb.collection('users').insertMany(profDocs);
            stats.professors = profDocs.length;
        }

        const [courses] = await pool.query(`
            SELECT c.*, p.name as prof_name, p.email as prof_email
            FROM COURSE c
            LEFT JOIN PROFESSOR p ON c.professor_id = p.professor_id
        `);

        if (courses.length > 0) {
            const courseDocs = courses.map(course => ({
                courseId: toMongoId(course.course_id, 'course'),
                courseName: course.course_name,
                credits: course.credits,
                seatsAvailable: course.seats_available,
                totalSeats: course.seats_available,
                professor: course.professor_id ? {
                    professorId: toMongoId(course.professor_id, 'professor'),
                    name: course.prof_name || 'TBD',
                    email: course.prof_email || 'TBD'
                } : null,
                enrollmentCount: 0
            }));
            await mongoDb.collection('courses').insertMany(courseDocs);
            stats.courses = courseDocs.length;

            for (const course of courses) {
                if (course.professor_id) {
                    await mongoDb.collection('users').updateOne(
                        { userId: toMongoId(course.professor_id, 'professor') },
                        { $push: { teachingCourses: toMongoId(course.course_id, 'course') } }
                    );
                }
            }
        }

        const [enrollments] = await pool.query(`
            SELECT e.*, s.name as student_name, c.course_name, c.credits,
                   p.name as professor_name
            FROM ENROLLMENT e
            JOIN STUDENT s ON e.student_id = s.student_id
            JOIN COURSE c ON e.course_id = c.course_id
            LEFT JOIN PROFESSOR p ON c.professor_id = p.professor_id
        `);

        if (enrollments.length > 0) {
            const enrollmentDocs = enrollments.map(enrollment => ({
                enrollmentId: toMongoId(enrollment.enrollment_id, 'enrollment'),
                studentId: toMongoId(enrollment.student_id, 'student'),
                courseId: toMongoId(enrollment.course_id, 'course'),
                studentName: enrollment.student_name,
                courseName: enrollment.course_name,
                professorName: enrollment.professor_name || 'TBD',
                credits: enrollment.credits,
                grade: enrollment.grade,
                enrolledAt: new Date()
            }));
            await mongoDb.collection('enrollments').insertMany(enrollmentDocs);
            stats.enrollments = enrollmentDocs.length;

            const studentCoursesMap = {};
            const courseEnrollmentMap = {};

            for (const enrollment of enrollmentDocs) {
                if (!studentCoursesMap[enrollment.studentId]) {
                    studentCoursesMap[enrollment.studentId] = { courses: [], totalCredits: 0 };
                }
                studentCoursesMap[enrollment.studentId].courses.push({
                    courseId: enrollment.courseId,
                    courseName: enrollment.courseName,
                    credits: enrollment.credits,
                    professorName: enrollment.professorName,
                    enrollmentId: enrollment.enrollmentId,
                    grade: enrollment.grade
                });
                studentCoursesMap[enrollment.studentId].totalCredits += enrollment.credits || 0;

                courseEnrollmentMap[enrollment.courseId] = (courseEnrollmentMap[enrollment.courseId] || 0) + 1;
            }

            for (const [studentId, data] of Object.entries(studentCoursesMap)) {
                await mongoDb.collection('users').updateOne(
                    { userId: studentId },
                    {
                        $set: {
                            enrolledCourses: data.courses,
                            totalCredits: data.totalCredits
                        }
                    }
                );
            }

            for (const [courseId, count] of Object.entries(courseEnrollmentMap)) {
                await mongoDb.collection('courses').updateOne(
                    { courseId },
                    { $set: { enrollmentCount: count } }
                );
            }
        }

        console.log('Migration completed!', stats);
        return stats;

    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        if (currentDbType === 'mongodb') {
            const user = await mongoDb.collection('users').findOne({ email });

            if (!user) {
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            if (password !== user.password) {
                return res.status(401).json({ success: false, message: 'Invalid password' });
            }

            const roleId = user.roleId || (user.accountType === 'admin' ? 4 : 3);

            return res.json({
                success: true,
                userId: user.userId,
                name: user.name,
                email: user.email,
                roleId: roleId
            });
        } else {
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
        }

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/register', async (req, res) => {
    const { name, email, password, dob, role_id } = req.body;

    try {
        if (currentDbType === 'mongodb') {
            const existingUser = await mongoDb.collection('users').findOne({ email });

            if (existingUser) {
                return res.status(409).json({ success: false, message: 'Email already registered' });
            }

            if (role_id === '3' || role_id === '4') {
                const userId = await getNextId('professor');

                const newUser = {
                    userId,
                    userType: 'professor',
                    name,
                    email,
                    password,
                    accountType: role_id === '4' ? 'admin' : 'regular',
                    roleId: parseInt(role_id),
                    teachingCourses: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                await mongoDb.collection('users').insertOne(newUser);

                const message = role_id === '4' ?
                    'Administrative staff account registered successfully!' :
                    'Professor account registered successfully!';

                res.json({ success: true, message });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Invalid role selected. Only staff registration is allowed.'
                });
            }
        } else {
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
        if (currentDbType === 'mongodb') {
            const existingUser = await mongoDb.collection('users').findOne({ email });

            if (existingUser) {
                return res.status(409).json({ success: false, message: 'Email already registered' });
            }

            if (role_id !== '1' && role_id !== '2') {
                return res.status(400).json({ success: false, message: 'Invalid student role selected' });
            }

            const tempPassword = generateTempPassword();
            const userId = await getNextId('student');

            const newStudent = {
                userId,
                userType: 'student',
                name,
                email,
                password: tempPassword,
                accountType: 'regular',
                dob: new Date(dob),
                roleId: parseInt(role_id),
                enrolledCourses: [],
                totalCredits: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await mongoDb.collection('users').insertOne(newStudent);

            // Send email
            try {
                const { sendStudentCredentials } = require('./mailer');
                await sendStudentCredentials(email, name, tempPassword);
            } catch (mailError) {
                console.log('Email sending failed:', mailError);
            }

            res.json({
                success: true,
                message: 'Student account created successfully!',
                studentId: userId,
                tempPassword: tempPassword
            });

        } else {
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

            try {
                const { sendStudentCredentials } = require('./mailer');
                await sendStudentCredentials(email, name, tempPassword);
            } catch (mailError) {
                console.log('Email sending failed:', mailError);
            }

            res.json({
                success: true,
                message: 'Student account created successfully!',
                studentId: studentId,
                tempPassword: tempPassword
            });
        }
    } catch (err) {
        console.error('Student creation error:', err);
        res.status(500).json({ success: false, message: 'Server error during student creation' });
    }
});

app.get('/api/courses', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const query = {};
            if (req.query.professor_id) {
                const profId = toMongoId(req.query.professor_id, 'professor');
                query['professor.professorId'] = profId;
            }

            const courses = await mongoDb.collection('courses').find(query).toArray();

            const transformedCourses = courses.map(course => ({
                course_id: fromMongoId(course.courseId),
                course_name: course.courseName,
                credits: course.credits,
                seats_available: course.seatsAvailable,
                professor_id: course.professor ? fromMongoId(course.professor.professorId) : null
            }));

            if (req.query.student_id) {
                const studentId = toMongoId(req.query.student_id, 'student');
                const student = await mongoDb.collection('users').findOne({ userId: studentId });
                const enrolledCourseIds = student?.enrolledCourses?.map(c => c.courseId) || [];

                transformedCourses.forEach(course => {
                    course.is_enrolled = enrolledCourseIds.includes(toMongoId(course.course_id, 'course'));
                });
            }

            res.json(transformedCourses);
        } else {
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
        }
    } catch (err) {
        console.error('Error fetching courses:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/courses/:id', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const courseId = toMongoId(req.params.id, 'course');
            const course = await mongoDb.collection('courses').findOne({ courseId });

            if (!course) {
                return res.status(404).json({ error: 'Course not found' });
            }

            const transformed = {
                course_id: fromMongoId(course.courseId),
                course_name: course.courseName,
                credits: course.credits,
                seats_available: course.seatsAvailable,
                professor_id: course.professor ? fromMongoId(course.professor.professorId) : null
            };

            res.json(transformed);
        } else {
            const [rows] = await pool.query(`
                SELECT c.*
                FROM COURSE c
                WHERE c.course_id = ?
            `, [req.params.id]);

            if (rows.length === 0) {
                return res.status(404).json({ error: 'Course not found' });
            }

            res.json(rows[0]);
        }
    } catch (err) {
        console.error('Error fetching course:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/courses', async (req, res) => {
    try {
        const { course_name, credits, seats_available, professor_id } = req.body;

        if (currentDbType === 'mongodb') {
            const courseId = await getNextId('course');

            const profId = professor_id ? toMongoId(professor_id, 'professor') : null;
            const professor = profId ? await mongoDb.collection('users').findOne({ userId: profId }) : null;

            const newCourse = {
                courseId,
                courseName: course_name,
                credits: parseInt(credits),
                seatsAvailable: parseInt(seats_available),
                totalSeats: parseInt(seats_available),
                professor: professor ? {
                    professorId: profId,
                    name: professor.name,
                    email: professor.email
                } : null,
                enrollmentCount: 0,
                recentEnrollments: [],
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await mongoDb.collection('courses').insertOne(newCourse);

            if (professor) {
                await mongoDb.collection('users').updateOne(
                    { userId: profId },
                    { $push: { teachingCourses: courseId } }
                );
            }

            res.json({ success: true, id: fromMongoId(courseId) });
        } else {
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
        }
    } catch (err) {
        console.error('Error creating course:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.put('/api/courses/:id', async (req, res) => {
    try {
        const { course_name, credits, seats_available, professor_id } = req.body;

        if (currentDbType === 'mongodb') {
            const courseId = toMongoId(req.params.id, 'course');

            const updateDoc = {
                courseName: course_name,
                credits: parseInt(credits),
                seatsAvailable: parseInt(seats_available),
                updatedAt: new Date()
            };

            if (professor_id) {
                const profId = toMongoId(professor_id, 'professor');
                const professor = await mongoDb.collection('users').findOne({ userId: profId });

                if (professor) {
                    updateDoc.professor = {
                        professorId: profId,
                        name: professor.name,
                        email: professor.email
                    };

                    await mongoDb.collection('users').updateOne(
                        { userId: profId },
                        { $addToSet: { teachingCourses: courseId } }
                    );
                }
            }

            await mongoDb.collection('courses').updateOne(
                { courseId },
                { $set: updateDoc }
            );

            res.json({ success: true });
        } else {
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
        }
    } catch (err) {
        console.error('Error updating course:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.delete('/api/courses/:id', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const courseId = toMongoId(req.params.id, 'course');

            await mongoDb.collection('users').updateMany(
                { teachingCourses: courseId },
                { $pull: { teachingCourses: courseId } }
            );

            await mongoDb.collection('enrollments').deleteMany({ courseId });

            await mongoDb.collection('users').updateMany(
                { 'enrolledCourses.courseId': courseId },
                { $pull: { enrolledCourses: { courseId } } }
            );

            await mongoDb.collection('courses').deleteOne({ courseId });

            res.json({ success: true });
        } else {
            await pool.query('DELETE FROM teaches WHERE course_id = ?', [req.params.id]);
            await pool.query('DELETE FROM ENROLLMENT WHERE course_id = ?', [req.params.id]);
            await pool.query('DELETE FROM COURSE WHERE course_id = ?', [req.params.id]);

            res.json({ success: true });
        }
    } catch (err) {
        console.error('Error deleting course:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.post('/api/enrollments', async (req, res) => {
    try {
        const { student_id, course_id } = req.body;

        if (currentDbType === 'mongodb') {
            const studentId = toMongoId(student_id, 'student');
            const courseId = toMongoId(course_id, 'course');

            const existingEnrollment = await mongoDb.collection('enrollments').findOne({
                studentId: studentId,
                courseId: courseId
            });

            if (existingEnrollment) {
                return res.status(400).json({
                    success: false,
                    message: 'Student already enrolled in this course'
                });
            }

            const student = await mongoDb.collection('users').findOne({ userId: studentId });
            const course = await mongoDb.collection('courses').findOne({ courseId: courseId });

            if (!student || !course) {
                return res.status(404).json({
                    success: false,
                    message: 'Student or course not found'
                });
            }

            if (course.seatsAvailable <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No seats available'
                });
            }

            const enrollmentId = await getNextId('enrollment');

            const enrollment = {
                enrollmentId,
                studentId,
                courseId,
                studentName: student.name,
                courseName: course.courseName,
                professorName: course.professor?.name || 'TBD',
                credits: course.credits,
                grade: null,
                enrolledAt: new Date()
            };

            await mongoDb.collection('enrollments').insertOne(enrollment);

            await mongoDb.collection('courses').updateOne(
                { courseId: courseId },
                {
                    $inc: { seatsAvailable: -1, enrollmentCount: 1 },
                    $push: {
                        recentEnrollments: {
                            $each: [{
                                studentId: studentId,
                                studentName: student.name,
                                enrolledAt: new Date()
                            }],
                            $slice: -10
                        }
                    }
                }
            );

            await mongoDb.collection('users').updateOne(
                { userId: studentId },
                {
                    $push: {
                        enrolledCourses: {
                            courseId: courseId,
                            courseName: course.courseName,
                            credits: course.credits,
                            professorName: course.professor?.name || 'TBD',
                            enrollmentId: enrollmentId,
                            grade: null
                        }
                    },
                    $inc: { totalCredits: course.credits }
                }
            );

            try {
                const { sendEnrollmentConfirmation } = require('./mailer');
                await sendEnrollmentConfirmation(student.email, student.name, course.courseName);
            } catch (mailError) {
                console.log('Email sending failed:', mailError);
            }

            res.json({ success: true, id: fromMongoId(enrollmentId) });

        } else {
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

            try {
                const { sendEnrollmentConfirmation } = require('./mailer');
                await sendEnrollmentConfirmation(student.email, student.name, course.course_name);
            } catch (mailError) {
                console.log('Email sending failed:', mailError);
            }

            res.json({ success: true, id: insertResult.insertId });
        }
    } catch (err) {
        console.error('Error creating enrollment:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.delete('/api/enrollments/:id', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const enrollmentId = toMongoId(req.params.id, 'enrollment');

            const enrollment = await mongoDb.collection('enrollments').findOne({ enrollmentId });

            if (!enrollment) {
                return res.status(404).json({ success: false, message: 'Enrollment not found' });
            }

            await mongoDb.collection('enrollments').deleteOne({ enrollmentId });

            await mongoDb.collection('courses').updateOne(
                { courseId: enrollment.courseId },
                { $inc: { seatsAvailable: 1, enrollmentCount: -1 } }
            );

            const course = await mongoDb.collection('courses').findOne({ courseId: enrollment.courseId });
            await mongoDb.collection('users').updateOne(
                { userId: enrollment.studentId },
                {
                    $pull: { enrolledCourses: { enrollmentId } },
                    $inc: { totalCredits: -(course?.credits || 0) }
                }
            );

            res.json({ success: true });
        } else {
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
        }
    } catch (err) {
        console.error('Error deleting enrollment:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.put('/api/enrollments/:id/grade', async (req, res) => {
    try {
        const { grade } = req.body;

        if (currentDbType === 'mongodb') {
            const enrollmentId = toMongoId(req.params.id, 'enrollment');

            await mongoDb.collection('enrollments').updateOne(
                { enrollmentId },
                { $set: { grade } }
            );

            const enrollment = await mongoDb.collection('enrollments').findOne({ enrollmentId });
            if (enrollment) {
                await mongoDb.collection('users').updateOne(
                    {
                        userId: enrollment.studentId,
                        'enrolledCourses.enrollmentId': enrollmentId
                    },
                    { $set: { 'enrolledCourses.$.grade': grade } }
                );
            }

            res.json({ success: true });
        } else {
            await pool.query(`
                UPDATE ENROLLMENT SET grade = ? WHERE enrollment_id = ?
            `, [grade, req.params.id]);

            res.json({ success: true });
        }
    } catch (err) {
        console.error('Error updating grade:', err);
        res.status(500).json({ success: false, message: 'Database error' });
    }
});

app.get('/api/analytics/top-courses', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const topCourses = await mongoDb.collection('courses')
                .find({})
                .sort({ enrollmentCount: -1 })
                .limit(5)
                .toArray();

            const transformed = topCourses.map(course => ({
                course_name: course.courseName,
                professor_name: course.professor?.name || 'TBD',
                department_name: course.department?.name || 'Unknown',
                enrollment_count: course.enrollmentCount || 0
            }));

            res.json(transformed);
        } else {
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
        }
    } catch (err) {
        console.error('Error fetching analytics report:', err);
        res.status(500).json({ message: 'Database error' });
    }
});

app.get('/api/students/:id/courses', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const studentId = toMongoId(req.params.id, 'student');
            const student = await mongoDb.collection('users').findOne({ userId: studentId });

            if (!student) {
                return res.status(404).json({ error: 'Student not found' });
            }

            const courses = student.enrolledCourses || [];
            const transformed = courses.map(course => ({
                enrollment_id: fromMongoId(course.enrollmentId),
                course_name: course.courseName,
                credits: course.credits,
                grade: course.grade,
                course_id: fromMongoId(course.courseId),
                seats_available: null
            }));

            res.json(transformed);
        } else {
            const [rows] = await pool.query(`
                SELECT e.*, c.course_name, c.credits, c.seats_available
                FROM ENROLLMENT e
                JOIN COURSE c ON e.course_id = c.course_id
                WHERE e.student_id = ?
            `, [req.params.id]);

            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching student courses:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/students/:id/advisors', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const studentId = toMongoId(req.params.id, 'student');
            const student = await mongoDb.collection('users').findOne({ userId: studentId });

            if (!student || !student.advisorId) {
                return res.json([]);
            }

            const advisor = await mongoDb.collection('users').findOne({
                userId: student.advisorId,
                roleId: 2
            });

            if (!advisor) {
                return res.json([]);
            }

            const transformed = {
                student_id: fromMongoId(advisor.userId),
                name: advisor.name,
                email: advisor.email,
                dob: advisor.dob,
                department_id: advisor.department ? fromMongoId(advisor.department.departmentId) : null,
                department_name: advisor.department?.name || null
            };

            res.json([transformed]);
        } else {
            const [rows] = await pool.query(`
                SELECT s.student_id, s.name, s.email, s.dob, sd.department_id, d.name as department_name
                FROM STUDENT s
                LEFT JOIN STUDENT_DEPARTMENT sd ON s.student_id = sd.student_id
                LEFT JOIN DEPARTMENT d ON sd.department_id = d.department_id
                WHERE s.student_id = (SELECT advisor_id FROM STUDENT WHERE student_id = ?)
                  AND s.role_id = 2
            `, [req.params.id]);

            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching student advisors:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/students', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const profId = toMongoId(req.params.id, 'professor');

            const courses = await mongoDb.collection('courses')
                .find({ 'professor.professorId': profId })
                .toArray();

            const courseIds = courses.map(c => c.courseId);
            const enrollments = await mongoDb.collection('enrollments')
                .find({ courseId: { $in: courseIds } })
                .toArray();

            const transformed = enrollments.map(enrollment => ({
                student_name: enrollment.studentName,
                email: '',
                course_name: enrollment.courseName
            }));

            res.json(transformed);
        } else {
            const [rows] = await pool.query(`
                SELECT 
                    s.name AS student_name,
                    s.email,
                    c.course_name
                FROM ENROLLMENT e
                JOIN STUDENT s ON e.student_id = s.student_id
                JOIN COURSE c ON e.course_id = c.course_id
                WHERE c.professor_id = ?
            `, [req.params.id]);

            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching professor\'s students:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/courses', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const profId = toMongoId(req.params.id, 'professor');

            const courses = await mongoDb.collection('courses')
                .find({ 'professor.professorId': profId })
                .toArray();

            const transformed = courses.map(course => ({
                course_id: fromMongoId(course.courseId),
                course_name: course.courseName,
                credits: course.credits,
                seats_available: course.seatsAvailable,
                enrolled_count: course.enrollmentCount || 0
            }));

            res.json(transformed);
        } else {
            const [rows] = await pool.query(`
                SELECT c.*, 
                       (SELECT COUNT(*) FROM ENROLLMENT WHERE course_id = c.course_id) as enrolled_count
                FROM COURSE c
                JOIN teaches t ON c.course_id = t.course_id
                WHERE t.professor_id = ?
            `, [req.params.id]);

            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching professor courses:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/department', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const profId = toMongoId(req.params.id, 'professor');
            const professor = await mongoDb.collection('users').findOne({ userId: profId });

            if (!professor || !professor.department) {
                return res.json({ message: 'Professor not assigned to any department' });
            }

            const transformed = {
                department_id: fromMongoId(professor.department.departmentId),
                name: professor.department.name,
                location: professor.department.location
            };

            res.json(transformed);
        } else {
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
        }
    } catch (err) {
        console.error('Error fetching professor department:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/professors/:id/advisees', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            res.json([]);
        } else {
            const [rows] = await pool.query(`
                SELECT s.*
                FROM STUDENT s
                JOIN advises a ON s.student_id = a.student_id
                WHERE a.professor_id = ?
            `, [req.params.id]);

            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching professor advisees:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/courses/:id/enrollments', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const courseId = toMongoId(req.params.id, 'course');

            const enrollments = await mongoDb.collection('enrollments')
                .find({ courseId })
                .toArray();

            const transformed = enrollments.map(enrollment => ({
                enrollment_id: fromMongoId(enrollment.enrollmentId),
                student_id: fromMongoId(enrollment.studentId),
                course_id: fromMongoId(enrollment.courseId),
                grade: enrollment.grade,
                student_name: enrollment.studentName,
                email: ''
            }));

            res.json(transformed);
        } else {
            const [rows] = await pool.query(`
                SELECT e.*, s.name as student_name, s.email
                FROM ENROLLMENT e
                JOIN STUDENT s ON e.student_id = s.student_id
                WHERE e.course_id = ?
            `, [req.params.id]);

            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching course enrollments:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/departments', async (req, res) => {
    try {
        if (currentDbType === 'mongodb') {
            const departments = await mongoDb.collection('departments').find({}).toArray();

            const transformed = departments.map(dept => ({
                department_id: fromMongoId(dept.departmentId),
                name: dept.name,
                location: dept.location
            }));

            res.json(transformed);
        } else {
            const [rows] = await pool.query('SELECT * FROM DEPARTMENT');
            res.json(rows);
        }
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
        if (currentDbType === 'mongodb') {
            const students = await mongoDb.collection('users')
                .find({
                    userType: 'student',
                    roleId: { $in: [1, 2] }
                })
                .sort({ _id: -1 })
                .toArray();

            const transformed = students.map(student => ({
                student_id: fromMongoId(student.userId),
                name: student.name,
                email: student.email,
                dob: student.dob,
                role_name: student.roleId === 1 ? 'student' : 'student_advisor',
                role_id: student.roleId
            }));

            res.json(transformed);
        } else {
            const [rows] = await pool.query(`
                SELECT s.student_id, s.name, s.email, s.dob, r.role_name, s.role_id
                FROM STUDENT s
                JOIN ROLE r ON s.role_id = r.role_id
                WHERE s.role_id IN (1, 2)
                ORDER BY s.student_id DESC
            `);

            res.json(rows);
        }
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ error: 'Database error' });
    }
});





app.listen(port, () => {
    currentDbType = 'mariadb';

    console.log(`🚀 Server is running at http://localhost:${port}`);
    console.log(`Starting with database: MariaDB`);
});