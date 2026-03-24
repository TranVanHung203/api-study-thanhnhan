import nodemailer from 'nodemailer';

// Cau hinh email transporter
const createTransporter = () => {
  const emailService = process.env.EMAIL_SERVICE || 'gmail';

  const config = {
    service: emailService,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    // Cau hinh cho Render + Production
    secure: true,
    port: 465,
    connectionTimeout: 5000,
    socketTimeout: 5000,
  };

  // Neu dung Gmail thi co the dung port 587 + starttls
  if (emailService === 'gmail') {
    config.port = 587;
    config.secure = false;
    config.requireTLS = true;
  }

  return nodemailer.createTransport(config);
};

const sendHtmlEmail = async ({ email, subject, html, logPrefix }) => {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transporter = createTransporter();

      if (process.env.NODE_ENV === 'development') {
        await transporter.verify();
      }

      const mailOptions = {
        from: `"${process.env.APP_NAME || 'Trang Học Online'}" <${process.env.EMAIL_USER}>`,
        to: email,
        subject,
        html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`${logPrefix} sent to ${email} (attempt ${attempt}):`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt}/${maxRetries} failed to send email to ${email}:`, error.message);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.error(`Failed to send email to ${email} after ${maxRetries} attempts:`, lastError?.message);
  console.error('Env check - EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
  console.error('Env check - EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
  return { success: false, error: lastError?.message || 'Unknown error' };
};

// Ham gui OTP dang ky
export const sendOTPEmail = async (email, otp, fullName) => {
  return sendHtmlEmail({
    email,
    subject: 'Mã OTP xác thực đăng ký tài khoản',
    logPrefix: 'Register OTP email',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4CAF50;">Xin chào ${fullName}!</h2>
        <p>Cảm ơn bạn đã đăng ký tài khoản trên hệ thống của chúng tôi.</p>
        <p>Mã OTP của bạn là:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666;">Mã OTP này có hiệu lực trong <strong>10 phút</strong>.</p>
        <p style="color: #666;">Nếu bạn không thực hiện đăng ký này, vui lòng bỏ qua email này.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
      </div>
    `
  });
};

// Ham gui OTP dat lai mat khau
export const sendPasswordResetOTPEmail = async (email, otp, fullName = 'ban') => {
  return sendHtmlEmail({
    email,
    subject: 'Mã OTP đặt lại mật khẩu',
    logPrefix: 'Password reset OTP email',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2196F3;">Xin chào ${fullName}!</h2>
        <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p>Mã OTP đặt lại mật khẩu là:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p style="color: #666;">Mã OTP này có hiệu lực trong <strong>10 phút</strong>.</p>
        <p style="color: #666;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này.</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
      </div>
    `
  });
};

// Ham tao OTP ngau nhien 6 chu so
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
