
-- first this
INSERT INTO ROLE (role_id, role_name) VALUES (1, 'student');
INSERT INTO ROLE (role_id, role_name) VALUES (2, 'student_advisor');
INSERT INTO ROLE (role_id, role_name) VALUES (3, 'professor');


-- _____________________________________________________

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS university;
USE university;

-- Create ROLE table
CREATE TABLE ROLE (
                      role_id INT AUTO_INCREMENT PRIMARY KEY,
                      role_name VARCHAR(20) NOT NULL
);

-- Create DEPARTMENT table
CREATE TABLE DEPARTMENT (
                            department_id INT AUTO_INCREMENT PRIMARY KEY,
                            name VARCHAR(100) NOT NULL,
                            location VARCHAR(100)
);

-- Create PROFESSOR table
CREATE TABLE PROFESSOR (
                           professor_id INT AUTO_INCREMENT PRIMARY KEY,
                           name VARCHAR(100) NOT NULL,
                           email VARCHAR(100) NOT NULL UNIQUE
);

-- Create PROFESSOR_ACCOUNT table
CREATE TABLE PROFESSOR_ACCOUNT (
                                   account_id INT AUTO_INCREMENT PRIMARY KEY,
                                   professor_id INT NOT NULL,
                                   password VARCHAR(100) NOT NULL,
                                   account_type VARCHAR(20),
                                   FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id)
);

-- Create PROFESSOR_DEPARTMENT table
CREATE TABLE PROFESSOR_DEPARTMENT (
                                      professor_id INT NOT NULL,
                                      department_id INT NOT NULL,
                                      PRIMARY KEY (professor_id, department_id),
                                      FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id),
                                      FOREIGN KEY (department_id) REFERENCES DEPARTMENT(department_id)
);

-- Create COURSE table
CREATE TABLE COURSE (
                        course_id INT AUTO_INCREMENT PRIMARY KEY,
                        course_name VARCHAR(100) NOT NULL,
                        credits INT,
                        seats_available INT,
                        professor_id INT,
                        FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id)
);

-- Create STUDENT table
CREATE TABLE STUDENT (
                         student_id INT AUTO_INCREMENT PRIMARY KEY,
                         name VARCHAR(100) NOT NULL,
                         email VARCHAR(100) NOT NULL UNIQUE,
                         dob DATE,
                         advisor_id INT,
                         role_id INT,
                         FOREIGN KEY (advisor_id) REFERENCES PROFESSOR(professor_id),
                         FOREIGN KEY (role_id) REFERENCES ROLE(role_id)
);

-- Create STUDENT_ACCOUNT table
CREATE TABLE STUDENT_ACCOUNT (
                                 account_id INT AUTO_INCREMENT PRIMARY KEY,
                                 student_id INT NOT NULL,
                                 password VARCHAR(100) NOT NULL,
                                 account_type VARCHAR(20),
                                 FOREIGN KEY (student_id) REFERENCES STUDENT(student_id)
);

-- Create STUDENT_DEPARTMENT table
CREATE TABLE STUDENT_DEPARTMENT (
                                    student_id INT NOT NULL,
                                    department_id INT NOT NULL,
                                    PRIMARY KEY (student_id, department_id),
                                    FOREIGN KEY (student_id) REFERENCES STUDENT(student_id),
                                    FOREIGN KEY (department_id) REFERENCES DEPARTMENT(department_id)
);

-- Create ENROLLMENT table
CREATE TABLE ENROLLMENT (
                            enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
                            student_id INT NOT NULL,
                            course_id INT NOT NULL,
                            grade VARCHAR(2),
                            FOREIGN KEY (student_id) REFERENCES STUDENT(student_id),
                            FOREIGN KEY (course_id) REFERENCES COURSE(course_id)
);

-- Create TEACHES table
CREATE TABLE teaches (
                         professor_id INT NOT NULL,
                         course_id INT NOT NULL,
                         PRIMARY KEY (professor_id, course_id),
                         FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id),
                         FOREIGN KEY (course_id) REFERENCES COURSE(course_id)
);

-- Create ADVISES table
CREATE TABLE advises (
                         professor_id INT NOT NULL,
                         student_id INT NOT NULL,
                         PRIMARY KEY (professor_id, student_id),
                         FOREIGN KEY (professor_id) REFERENCES PROFESSOR(professor_id),
                         FOREIGN KEY (student_id) REFERENCES STUDENT(student_id)
);