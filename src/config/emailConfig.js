import nodemailer from 'nodemailer';

// Cấu hình email transporter
const createTransporter = () => {
  const emailService = process.env.EMAIL_SERVICE || 'gmail';
  
  const config = {
    service: emailService,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    // Cấu hình cho Render + Production
    secure: true, // Sử dụng SSL/TLS
    port: 465,
    connectionTimeout: 5000, // 5s timeout
    socketTimeout: 5000,
  };

  // Nếu dùng Gmail thì có thể dùng port 587 + starttls
  if (emailService === 'gmail') {
    config.port = 587;
    config.secure = false;
    config.requireTLS = true;
  }

  return nodemailer.createTransport(config);
};

// Hàm gửi OTP qua email (asynchronous - không chờ gửi xong)
export const sendOTPEmail = async (email, otp, fullName) => {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transporter = createTransporter();

      // Verify connection (optional - để debug)
      if (process.env.NODE_ENV === 'development') {
        await transporter.verify();
      }

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
      console.log(`✅ Email sent successfully to ${email} (attempt ${attempt}):`, info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      lastError = error;
      console.error(`❌ Attempt ${attempt}/${maxRetries} failed to send email to ${email}:`, error.message);
      
      // Nếu còn retry, chờ 1s rồi thử lại
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // Log error cuối cùng
  console.error(`⚠️  Failed to send OTP email to ${email} after ${maxRetries} attempts:`, lastError.message);
  console.error('Env check - EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
  console.error('Env check - EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
  
  return { success: false, error: lastError.message };
};

// Hàm tạo OTP ngẫu nhiên 6 chữ số
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
