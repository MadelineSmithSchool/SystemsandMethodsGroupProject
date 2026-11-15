const nodemailer = require('nodemailer');

async function sendResetEmail(to, link) {
  if (!process.env.SMTP_HOST) {
    console.log(`[DEV] Password reset link for ${to}: ${link}`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Reset your RPG Templates password',
    text: `Use this link to reset your password (valid for 1 hour):\n\n${link}\n\nIf you didn't request this, ignore this email.`,
  });
}

module.exports = { sendResetEmail };