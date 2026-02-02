import nodemailer from 'nodemailer';

// Cấu hình email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail', // gmail, outlook, etc.
    auth: {
      user: process.env.EMAIL_USER, // Email của bạn
      pass: process.env.EMAIL_PASSWORD // App password hoặc mật khẩu email
    }
  });
};

// Hàm gửi OTP qua email
export const sendOTPEmail = async (email, otp, fullName) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Trang Học Online'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Mã OTP xác thực đăng ký tài khoản',
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
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Không thể gửi email. Vui lòng thử lại sau.');
  }
};

// Hàm tạo OTP ngẫu nhiên 6 chữ số
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
