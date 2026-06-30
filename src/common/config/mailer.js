import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  secure: false, // true for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendMail({ to, subject, text, html }) {
  return transporter.sendMail({
    from:
      process.env.SMTP_FROM || '"Egg Export Platform" <noreply@eggexport.com>',
    to,
    subject,
    text,
    html,
  });
}
