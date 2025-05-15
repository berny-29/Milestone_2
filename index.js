// Load environment variables from .env
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const port = 3000;

// Middleware (optional)
app.use(express.json());

// Create DB connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Root route
app.get('/', (req, res) => {
  res.send('🎓 Welcome to the Student Enrollment System!');
});

// Sample route to fetch all students
app.get('/students', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM STUDENT');
    res.json(rows);
  } catch (err) {
    console.error('Error querying database:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});