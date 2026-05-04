import mongoose from 'mongoose';
import 'dotenv/config';
import School from '../src/models/school.schema.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/trangdayhoconline';

const seedData = [
  {
    name: 'Trường THPT Hà Nội - Trung tâm',
    address: '123 Đường Lê Lợi, Quận Hoàn Kiếm, Hà Nội',
    isActive: true
  },
  {
    name: 'Trường THPT Sài Gòn',
    address: '456 Nguyễn Huệ, Quận 1, TP.HCM',
    isActive: true
  },
  {
    name: 'Trường THPT Đà Nẵng',
    address: '789 Ách Mỹ Hưng, Quận Hải Châu, Đà Nẵng',
    isActive: true
  },
  {
    name: 'Trường THPT Cần Thơ',
    address: '321 Ngô Quyền, Quận Ninh Kiều, Cần Thơ',
    isActive: true
  },
  {
    name: 'Trường THPT Hải Phòng',
    address: '654 Tràng Tiền, Quận Hồng Bàng, Hải Phòng',
    isActive: true
  }
];

const main = async () => {
  try {
    console.log('Kết nối tới MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Kết nối thành công!');

    // Xóa dữ liệu cũ (tuỳ chọn)
    console.log('\nXóa dữ liệu cũ...');
    const deleted = await School.deleteMany({});
    console.log(`✓ Đã xóa ${deleted.deletedCount} trường học cũ`);

    // Chèn dữ liệu mẫu
    console.log('\nThêm dữ liệu mẫu...');
    const inserted = await School.insertMany(seedData);
    console.log(`✓ Đã thêm ${inserted.length} trường học mới`);

    // Hiển thị danh sách
    console.log('\nDanh sách trường học:');
    const schools = await School.find().lean();
    schools.forEach((school, index) => {
      console.log(`${index + 1}. [${school._id}] ${school.name}`);
      console.log(`   Địa chỉ: ${school.address}`);
      console.log(`   Trạng thái: ${school.isActive ? 'Hoạt động' : 'Không hoạt động'}`);
    });

    console.log('\n✓ Seed dữ liệu thành công!');
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nĐã ngắt kết nối MongoDB');
  }
};

main();
