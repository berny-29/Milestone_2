const mysql = require('mysql2/promise');
const { faker } = require('@faker-js/faker');

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

async function generateFakeData(connection) {
    const departments = ['Computer Science', 'Mathematics', 'Physics', 'Business', 'Arts', 'Engineering', 'Biology', 'Chemistry'];
    const locations = ['Building A', 'Building B', 'Building C', 'Building D', 'Building E', 'Science Wing', 'Tech Center', 'Main Campus'];

    for (let i = 0; i < departments.length; i++) {
        await connection.query(
            'INSERT INTO DEPARTMENT (department_id, name, location) VALUES (?, ?, ?)',
            [i + 1, departments[i], locations[i]]
        );
    }
    const [deptRows] = await connection.query('SELECT department_id FROM DEPARTMENT');
    const departmentIds = deptRows.map(row => row.department_id);

    const professorCount = 15;
    for (let i = 0; i < professorCount; i++) {
        const deptId = departmentIds[Math.floor(Math.random() * departmentIds.length)];
        const name = faker.person.fullName();
        const email = faker.internet.email();

        await connection.query(
            'INSERT INTO PROFESSOR (professor_id, name, email) VALUES (?, ?, ?)',
            [i + 1, name, email]
        );

        await connection.query(
            'INSERT INTO PROFESSOR_ACCOUNT (professor_id, password, account_type) VALUES (?, ?, ?)',
            [i + 1, generateTempPassword(), 'regular']
        );

        await connection.query(
            'INSERT INTO PROFESSOR_DEPARTMENT (professor_id, department_id) VALUES (?, ?)',
            [i + 1, deptId]
        );
    }
    const professorIds = Array.from({ length: professorCount }, (_, i) => i + 1);

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
        'INSERT INTO STUDENT_ACCOUNT (student_id, password, account_type) VALUES (?, ?, ?)',
        [testStudentId, testPassword, 'regular']
    );

    await connection.query(
        'INSERT INTO STUDENT_DEPARTMENT (student_id, department_id) VALUES (?, ?)',
        [testStudentId, testDeptId]
    );

    const studentCount = 100;
    for (let i = 1; i < studentCount; i++) {
        const name = faker.person.fullName();
        const email = faker.internet.email();
        const dob = faker.date.past({ years: 20, refDate: new Date(2002, 0, 1) }).toISOString().split('T')[0];
        const roleId = Math.random() < 0.9 ? 1 : 2;
        const advisorId = professorIds[Math.floor(Math.random() * professorIds.length)];

        await connection.query(
            'INSERT INTO STUDENT (student_id, name, email, dob, advisor_id, role_id) VALUES (?, ?, ?, ?, ?, ?)',
            [i + 1, name, email, dob, null, roleId]
        );

        await connection.query(
            'INSERT INTO STUDENT_ACCOUNT (student_id, password, account_type) VALUES (?, ?, ?)',
            [i + 1, generateTempPassword(), 'regular']
        );

        const deptId = departmentIds[Math.floor(Math.random() * departmentIds.length)];
        await connection.query(
            'INSERT INTO STUDENT_DEPARTMENT (student_id, department_id) VALUES (?, ?)',
            [i + 1, deptId]
        );
    }
    const studentIds = Array.from({ length: studentCount }, (_, i) => i + 1);

    const studentAdvisorIds = [];
    for (let i = 1; i <= studentCount; i++) {
        const [roleCheck] = await connection.query('SELECT role_id FROM STUDENT WHERE student_id = ?', [i]);
        if (roleCheck[0] && roleCheck[0].role_id === 2) {
            studentAdvisorIds.push(i);
        }
    }

    if (studentAdvisorIds.length === 0) {
        await connection.query('UPDATE STUDENT SET role_id = 2 WHERE student_id = 2');
        studentAdvisorIds.push(2);
    }

    for (let i = 1; i <= studentCount; i++) {
        if (studentAdvisorIds.includes(i)) continue;

        const advisorId = studentAdvisorIds[Math.floor(Math.random() * studentAdvisorIds.length)];
        await connection.query('UPDATE STUDENT SET advisor_id = ? WHERE student_id = ?', [advisorId, i]);
    }

    const courseSubjects = [
        'Introduction to Programming', 'Data Structures', 'Algorithms', 'Database Systems', 'Web Development',
        'Calculus I', 'Calculus II', 'Linear Algebra', 'Statistics', 'Discrete Mathematics',
        'Physics I', 'Physics II', 'Quantum Mechanics', 'Thermodynamics', 'Electromagnetism',
        'Business Management', 'Marketing', 'Finance', 'Economics', 'Accounting',
        'Art History', 'Drawing', 'Painting', 'Sculpture', 'Digital Art',
        'Software Engineering', 'Machine Learning', 'Artificial Intelligence', 'Computer Networks', 'Cybersecurity'
    ];

    const courseCount = 30;
    for (let i = 0; i < courseCount; i++) {
        const courseId = i + 1;
        const courseName = courseSubjects[i % courseSubjects.length] + (i >= courseSubjects.length ? ` ${Math.floor(i / courseSubjects.length) + 2}` : '');
        const credits = Math.floor(Math.random() * 5) + 2;
        const seatsAvailable = 15 + Math.floor(Math.random() * 35);
        const profId = professorIds[Math.floor(Math.random() * professorIds.length)];

        await connection.query(
            'INSERT INTO COURSE (course_id, course_name, credits, seats_available, professor_id) VALUES (?, ?, ?, ?, ?)',
            [courseId, courseName, credits, seatsAvailable, profId]
        );

        await connection.query(
            'INSERT INTO teaches (professor_id, course_id) VALUES (?, ?)',
            [profId, courseId]
        );
    }
    const courseIds = Array.from({ length: courseCount }, (_, i) => i + 1);

    const enrollmentCount = 200;
    let successfulEnrollments = 0;

    for (let i = 0; i < enrollmentCount; i++) {
        const studentId = studentIds[Math.floor(Math.random() * studentIds.length)];
        const courseId = courseIds[Math.floor(Math.random() * courseIds.length)];

        const [exists] = await connection.query(
            'SELECT COUNT(*) as count FROM ENROLLMENT WHERE student_id = ? AND course_id = ?',
            [studentId, courseId]
        );

        if (exists[0].count > 0) continue;

        const [seatCheck] = await connection.query(
            'SELECT seats_available, (SELECT COUNT(*) FROM ENROLLMENT WHERE course_id = ?) as enrolled FROM COURSE WHERE course_id = ?',
            [courseId, courseId]
        );

        if (seatCheck[0].enrolled >= seatCheck[0].seats_available) continue;

        const grade = Math.random() < 0.7 ? ['A', 'B', 'C', 'D', 'F'][Math.floor(Math.random() * 5)] : null;

        await connection.query(
            'INSERT INTO ENROLLMENT (student_id, course_id, grade) VALUES (?, ?, ?)',
            [studentId, courseId, grade]
        );

        await connection.query(
            'UPDATE COURSE SET seats_available = GREATEST(seats_available - 1, 0) WHERE course_id = ?',
            [courseId]
        );

        successfulEnrollments++;
    }

    await connection.query(
        'INSERT INTO PROFESSOR (name, email) VALUES (?, ?)',
        ['Test Admin', 'admin@university.com']
    );

    const [adminResult] = await connection.query('SELECT LAST_INSERT_ID() as id');
    const adminProfessorId = adminResult[0].id;

    await connection.query(
        'INSERT INTO PROFESSOR_ACCOUNT (professor_id, password, account_type) VALUES (?, ?, ?)',
        [adminProfessorId, 'admin123', 'admin']
    );

    console.log('\nDatabase reset and dummy data generation completed successfully!');
    console.log('Summary of generated data:');
    console.log(`   - ${departments.length} Departments`);
    console.log(`   - ${professorCount} Professors with accounts`);
    console.log(`   - ${studentCount} Students with accounts`);
    console.log(`   - ${courseCount} Courses`);
    console.log(`   - ${successfulEnrollments} Enrollments`);

    console.log('\nTest Login Credentials:');
    console.log('   Student: test@student.com / [generated password]');
    console.log('   Admin: admin@university.com / admin123');
    console.log('   Professor: Any generated professor email / [generated password]');
}

function initResetRoutes(app) {
    app.post('/api/reset-database', async (req, res) => {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();
            await connection.query('SET FOREIGN_KEY_CHECKS = 0');

            const tables = [
                'teaches', 'advises', 'ENROLLMENT', 'STUDENT_ACCOUNT', 'PROFESSOR_ACCOUNT',
                'STUDENT_DEPARTMENT', 'PROFESSOR_DEPARTMENT', 'COURSE', 'STUDENT', 'PROFESSOR',
                'DEPARTMENT', 'ROLE'
            ];

            for (const table of tables) {
                await connection.query(`DROP TABLE IF EXISTS ${table}`);
            }

            await connection.query('SET FOREIGN_KEY_CHECKS = 1');

            const createTablesSQL = [
                `CREATE TABLE ROLE (
                    role_id INT AUTO_INCREMENT PRIMARY KEY,
                    role_name VARCHAR(20) NOT NULL
                )`,
                `CREATE TABLE DEPARTMENT (
                    department_id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    location VARCHAR(100)
                )`,
                `CREATE TABLE PROFESSOR (
                    professor_id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(100) NOT NULL UNIQUE
                )`,
                `CREATE TABLE PROFESSOR_ACCOUNT (
                    account_id INT AUTO_INCREMENT PRIMARY KEY,
                    professor_id INT NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    account_type VARCHAR(20),
                    FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id)
                 )`,
                `CREATE TABLE PROFESSOR_DEPARTMENT (
                    professor_id INT NOT NULL,
                    department_id INT NOT NULL,
                    PRIMARY KEY (professor_id, department_id),
                    FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id),
                    FOREIGN KEY (department_id) REFERENCES DEPARTMENT(department_id)
                )`,
                `CREATE TABLE COURSE (
                    course_id INT AUTO_INCREMENT PRIMARY KEY,
                    course_name VARCHAR(100) NOT NULL,
                    credits INT,
                    seats_available INT,
                    professor_id INT,
                    FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id)
                )`,
                `CREATE TABLE STUDENT (
                    student_id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(100) NOT NULL UNIQUE,
                    dob DATE,
                    advisor_id INT,
                    role_id INT,
                    FOREIGN KEY (role_id) REFERENCES ROLE(role_id)
                )`,
                `CREATE TABLE STUDENT_ACCOUNT (
                    account_id INT AUTO_INCREMENT PRIMARY KEY,
                    student_id INT NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    account_type VARCHAR(20),
                    FOREIGN KEY (student_id) REFERENCES STUDENT(student_id)
                )`,
                `CREATE TABLE STUDENT_DEPARTMENT (
                    student_id INT NOT NULL,
                    department_id INT NOT NULL,
                    PRIMARY KEY (student_id, department_id),
                    FOREIGN KEY (student_id) REFERENCES STUDENT(student_id),
                    FOREIGN KEY (department_id) REFERENCES DEPARTMENT(department_id)
                )`,
                `CREATE TABLE ENROLLMENT (
                    enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
                    student_id INT NOT NULL,
                    course_id INT NOT NULL,
                    grade VARCHAR(2),
                    FOREIGN KEY (student_id) REFERENCES STUDENT(student_id),
                    FOREIGN KEY (course_id) REFERENCES COURSE(course_id)
                )`,
                `CREATE TABLE teaches (
                    professor_id INT NOT NULL,
                    course_id INT NOT NULL,
                    PRIMARY KEY (professor_id, course_id),
                    FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id),
                    FOREIGN KEY (course_id) REFERENCES COURSE(course_id)
                 )`,
                `CREATE TABLE advises (
                    professor_id INT NOT NULL,
                    student_id INT NOT NULL,
                    PRIMARY KEY (professor_id, student_id),
                    FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id),
                    FOREIGN KEY (student_id) REFERENCES STUDENT(student_id)
                )`
            ];

            for (const stmt of createTablesSQL) {
                await connection.query(stmt);
            }

            await connection.query(`
                INSERT INTO ROLE (role_id, role_name)
                VALUES
                    (1, 'student'),
                    (2, 'student_advisor'),
                    (3, 'professor'),
                    (4, 'administrative_staff')
            `);

            await generateFakeData(connection);

            await connection.query(`
                ALTER TABLE STUDENT 
                ADD CONSTRAINT fk_student_advisor 
                FOREIGN KEY (advisor_id) REFERENCES STUDENT(student_id)
            `);

            await connection.commit();

            res.json({
                success: true,
                message: 'Database reset and dummy data generation completed successfully!'
            });

        } catch (error) {
            await connection.rollback();
            console.error('Error during database reset and data generation:', error);
            res.status(500).json({ success: false, message: error.message });
        } finally {
            connection.release();
        }
    });
}

module.exports = { initResetRoutes };