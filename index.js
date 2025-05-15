// Load environment variables from .env
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const { faker } = require('@faker-js/faker');

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create DB connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  database: process.env.DB_NAME || 'student_enrollment',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Root route - redirect to login
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Login API endpoint
app.post('/api/login', async (req, res) => {
  const { email, password, role } = req.body;
  
  try {
    let query, params;
    
    if (role === 'student') {
      // Student login
      query = `
        SELECT s.student_id as id, s.name, s.email, sa.password
        FROM STUDENT s
        JOIN STUDENT_ACCOUNT sa ON s.student_id = sa.student_id
        WHERE s.email = ?
      `;
      params = [email];
    } else {
      // Professor login
      query = `
        SELECT professor_id as id, name, email, 'password123' as password
        FROM PROFESSOR
        WHERE email = ?
      `;
      params = [email];
    }
    
    const [rows] = await pool.query(query, params);
    
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    const user = rows[0];
    
    // In a real application, you would use bcrypt to compare passwords
    // For simplicity, we're doing a direct comparison
    if (password !== user.password && password !== 'password123') {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }
    
    // Login successful
    res.json({
      success: true,
      userId: user.id,
      name: user.name,
      email: user.email
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Course routes
app.get('/api/courses', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, d.name as department_name
      FROM COURSE c
      LEFT JOIN DEPARTMENT d ON c.department_id = d.department_id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/courses/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, d.name as department_name
      FROM COURSE c
      LEFT JOIN DEPARTMENT d ON c.department_id = d.department_id
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

app.post('/api/courses', async (req, res) => {
  try {
    const { course_name, credits, seats_available, department_id, professor_id } = req.body;
    
    const [result] = await pool.query(`
      INSERT INTO COURSE (course_name, credits, seats_available, department_id)
      VALUES (?, ?, ?, ?)
    `, [course_name, credits, seats_available, department_id]);
    
    // Also add the professor as teaching this course
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
    const { course_name, credits, seats_available, department_id, professor_id } = req.body;
    
    await pool.query(`
      UPDATE COURSE
      SET course_name = ?, credits = ?, seats_available = ?, department_id = ?
      WHERE course_id = ?
    `, [course_name, credits, seats_available, department_id, req.params.id]);
    
    // Update professor teaching relationship if needed
    if (professor_id) {
      // Check if relationship exists
      const [existing] = await pool.query(`
        SELECT * FROM teaches WHERE professor_id = ? AND course_id = ?
      `, [professor_id, req.params.id]);
      
      if (existing.length === 0) {
        // Create new teaches relationship
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
    // First delete related records
    await pool.query('DELETE FROM teaches WHERE course_id = ?', [req.params.id]);
    await pool.query('DELETE FROM ENROLLMENT WHERE course_id = ?', [req.params.id]);
    
    // Then delete the course
    await pool.query('DELETE FROM COURSE WHERE course_id = ?', [req.params.id]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting course:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// Enrollment routes
app.post('/api/enrollments', async (req, res) => {
  try {
    const { student_id, course_id, enrollment_date } = req.body;
    
    // Check if student is already enrolled
    const [existing] = await pool.query(`
      SELECT * FROM ENROLLMENT WHERE student_id = ? AND course_id = ?
    `, [student_id, course_id]);
    
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Student already enrolled in this course' });
    }
    
    // Check if seats are available
    const [courseRows] = await pool.query(`
      SELECT seats_available, 
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
    
    // Create enrollment
    const [result] = await pool.query(`
      INSERT INTO ENROLLMENT (student_id, course_id, enrollment_date)
      VALUES (?, ?, ?)
    `, [student_id, course_id, enrollment_date]);
    
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error creating enrollment:', err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.delete('/api/enrollments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ENROLLMENT WHERE enrollment_id = ?', [req.params.id]);
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

// Student specific routes
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
      SELECT p.*, d.name as department_name
      FROM PROFESSOR p
      JOIN advises a ON p.professor_id = a.professor_id
      LEFT JOIN DEPARTMENT d ON p.department_id = d.department_id
      WHERE a.student_id = ?
    `, [req.params.id]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error fetching student advisors:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Professor specific routes
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
      FROM DEPARTMENT d
      JOIN PROFESSOR p ON d.department_id = p.department_id
      WHERE p.professor_id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.json({ message: 'Professor not assigned to any department' });
    }
    
    const department = rows[0];
    
    // Get department courses
    const [courses] = await pool.query(`
      SELECT c.*, 
             p.name as professor_name,
             (SELECT COUNT(*) FROM ENROLLMENT WHERE course_id = c.course_id) as enrolled_count
      FROM COURSE c
      LEFT JOIN teaches t ON c.course_id = t.course_id
      LEFT JOIN PROFESSOR p ON t.professor_id = p.professor_id
      WHERE c.department_id = ?
    `, [department.department_id]);
    
    department.courses = courses;
    
    res.json(department);
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

// Department routes
app.get('/api/departments', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM DEPARTMENT');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching departments:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Data generation endpoint
app.post('/api/generate-data', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Clear existing data
    await connection.query('DELETE FROM advises');
    await connection.query('DELETE FROM teaches');
    await connection.query('DELETE FROM ENROLLMENT');
    await connection.query('DELETE FROM COURSE');
    await connection.query('DELETE FROM STUDENT_ACCOUNT');
    await connection.query('DELETE FROM STUDENT');
    await connection.query('DELETE FROM PROFESSOR');
    await connection.query('DELETE FROM DEPARTMENT');
    await connection.query('DELETE FROM ROLE');
    
    // Create roles
    await connection.query(`INSERT INTO ROLE (role_name) VALUES ('student'), ('professor'), ('admin')`);
    
    // Create departments
    const departments = ['Computer Science', 'Mathematics', 'Physics', 'Business', 'Arts'];
    const locations = ['Building A', 'Building B', 'Building C', 'Building D', 'Building E'];
    
    for (let i = 0; i < departments.length; i++) {
      await connection.query(
        'INSERT INTO DEPARTMENT (name, location) VALUES (?, ?)',
        [departments[i], locations[i]]
      );
    }
    
    // Get department IDs
    const [deptRows] = await connection.query('SELECT department_id FROM DEPARTMENT');
    const departmentIds = deptRows.map(row => row.department_id);
    
    // Create professors
    for (let i = 0; i < 10; i++) {
      const dept_id = departmentIds[Math.floor(Math.random() * departmentIds.length)];
      
      await connection.query(
        'INSERT INTO PROFESSOR (name, email, department_id) VALUES (?, ?, ?)',
        [
          faker.person.fullName(),
          faker.internet.email(),
          dept_id
        ]
      );
    }
    
    // Get professor IDs
    const [profRows] = await connection.query('SELECT professor_id FROM PROFESSOR');
    const professorIds = profRows.map(row => row.professor_id);
    
    // Create students and accounts
    for (let i = 0; i < 50; i++) {
      const studentName = faker.person.fullName();
      const studentEmail = faker.internet.email();
      
      const [studentResult] = await connection.query(
        'INSERT INTO STUDENT (name, email, dob) VALUES (?, ?, ?)',
        [
          studentName,
          studentEmail,
          faker.date.past({ years: 20, refDate: new Date(2002, 0, 1) }).toISOString().split('T')[0]
        ]
      );
      
      const studentId = studentResult.insertId;
      
      // Create student account
      await connection.query(
        'INSERT INTO STUDENT_ACCOUNT (student_id, account_type, password) VALUES (?, ?, ?)',
        [
          studentId,
          'regular',
          'password123' // In a real app, this would be hashed
        ]
      );
      
      // Assign advisors (professors) to students
      const advisorCount = Math.floor(Math.random() * 2) + 1; // 1 or 2 advisors
      const assignedAdvisors = new Set();
      
      for (let j = 0; j < advisorCount; j++) {
        let advisorId;
        do {
          advisorId = professorIds[Math.floor(Math.random() * professorIds.length)];
        } while (assignedAdvisors.has(advisorId));
        
        assignedAdvisors.add(advisorId);
        
        await connection.query(
          'INSERT INTO advises (professor_id, student_id) VALUES (?, ?)',
          [advisorId, studentId]
        );
      }
    }
    
    // Create courses
    for (let i = 0; i < 20; i++) {
      const deptId = departmentIds[Math.floor(Math.random() * departmentIds.length)];
      
      const [courseResult] = await connection.query(
        'INSERT INTO COURSE (course_name, credits, seats_available, department_id) VALUES (?, ?, ?, ?)',
        [
          faker.word.words(3) + ' ' + faker.number.int(400),
          Math.floor(Math.random() * 4) + 1,
          20 + Math.floor(Math.random() * 30), // 20-50 seats
          deptId
        ]
      );
      
      const courseId = courseResult.insertId;
      
      // Assign professor to teach course
      const profId = professorIds[Math.floor(Math.random() * professorIds.length)];
      
      await connection.query(
        'INSERT INTO teaches (professor_id, course_id) VALUES (?, ?)',
        [profId, courseId]
      );
    }
    
    // Create enrollments
    const [studentRows] = await connection.query('SELECT student_id FROM STUDENT');
    const studentIds = studentRows.map(row => row.student_id);
    
    const [courseRows] = await connection.query('SELECT course_id FROM COURSE');
    const courseIds = courseRows.map(row => row.course_id);
    
    for (let i = 0; i < 100; i++) {
      const studentId = studentIds[Math.floor(Math.random() * studentIds.length)];
      const courseId = courseIds[Math.floor(Math.random() * courseIds.length)];
      
      // Check if this student is already enrolled in this course
      const [existingEnrollment] = await connection.query(
        'SELECT COUNT(*) as count FROM ENROLLMENT WHERE student_id = ? AND course_id = ?',
        [studentId, courseId]
      );
      
      if (existingEnrollment[0].count === 0) {
        // Generate random enrollment date and possible grade
        const enrollmentDate = faker.date.past({ years: 1 }).toISOString().split('T')[0];
        
        // 70% chance of having a grade
        const hasGrade = Math.random() < 0.7;
        const grade = hasGrade ? ['A', 'B', 'C', 'D', 'F'][Math.floor(Math.random() * 5)] : null;
        
        await connection.query(
          'INSERT INTO ENROLLMENT (student_id, course_id, enrollment_date, grade) VALUES (?, ?, ?, ?)',
          [studentId, courseId, enrollmentDate, grade]
        );
      }
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

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});