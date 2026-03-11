import nodemailer from "nodemailer";
import crypto from "crypto";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const isEmailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const mailOptions = {
    from: `"Vibely" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Vibely — Verify your email",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
        <h2 style="color:#0d9488;margin-bottom:8px">Welcome to Vibely!</h2>
        <p>Use the code below to verify your email address:</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;padding:16px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;margin:16px 0">
          ${otp}
        </div>
        <p style="color:#6b7280;font-size:14px">This code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
  const mailOptions = {
    from: `"Vibely" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Vibely — Password Reset Code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
        <h2 style="color:#0d9488;margin-bottom:8px">Password Reset</h2>
        <p>Your Vibely password reset code is:</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;padding:16px;background:#fff;border-radius:8px;border:1px solid #e5e7eb;margin:16px 0">
          ${code}
        </div>
        <p style="color:#6b7280;font-size:14px">This code will expire in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}
