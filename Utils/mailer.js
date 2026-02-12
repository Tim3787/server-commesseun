const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

async function sendEmail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  });
}

module.exports = { sendEmail };
