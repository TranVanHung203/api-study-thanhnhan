import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Để load các biến môi trường từ file .env

class DatabaseConfig {
  constructor() {
    this.dbURI = process.env.MONGO_URI;
    this.connectionOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true
    };
  }

  // Phương thức kết nối cơ sở dữ liệu
  async connect() {
    try {
      await mongoose.connect(this.dbURI, this.connectionOptions);
      console.log('Kết nối thành công đến MongoDB!');
    } catch (error) {
      console.error('Lỗi kết nối MongoDB:', error);
      process.exit(1); // Thoát ứng dụng nếu kết nối thất bại
    }
  }

  // Phương thức ngắt kết nối
  async disconnect() {
    try {
      await mongoose.disconnect();
      console.log('Đã ngắt kết nối MongoDB!');
    } catch (error) {
      console.error('Lỗi ngắt kết nối MongoDB:', error);
    }
  }
}

export default DatabaseConfig;
