const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'sandbox.smtp.mailtrap.io',
  port: 2525,
  auth: {
    user: '173e40d2c740e8',
    pass: '0bd85545226b82'
  }
});

async function sendEnrollmentConfirmation(to, studentName, courseName) {
  const info = await transporter.sendMail({
    from: '"University of Vienna" <noreply@univienna.edu>',
    to,
    subject: 'Enrollment Confirmation',
    text: `Hello ${studentName},\n\nYou have successfully enrolled in ${courseName}.`,
    html: `<p>Hello ${studentName},</p><p>You have successfully enrolled in <strong>${courseName}</strong>.</p>`
  });

  console.log('📬 Email sent:', info.messageId);
}

module.exports = { sendEnrollmentConfirmation };