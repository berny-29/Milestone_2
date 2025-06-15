# Milestone 2 - University Management System
University management system with Docker support.

## Authors: 
- Samuel Nicolas Bernat
- Anamarija Kochoska

## Features
- Student/Professor/Admin management and creation
- Course enrollment and account creation
- Database reset with Faker, MariaDB ↔ MongoDB switching
- 100 students, 30 courses, etc. pre-loaded in MariaDB

## How to run
1. Install Docker Desktop
2. Run: `docker compose up --build`
3. Access: http://localhost:3000

## Login
- **Admin**: admin@university.com / admin123
- **Student**: test@student.com / password123
- Or check DB for other users / create new ones

## Other useful Docker commands:
 - to build: ```docker compose up --build ```
 - to start after build: ```docker compose up ```
 - to view logs: ```docker compose logs -f ```
 - to restart fresh: ```docker compose down -v```
 - to stop everything: ```docker compose down```
 - to chech running containers: ```docker compose ps```