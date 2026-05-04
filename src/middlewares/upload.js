import multer from 'multer';

// Lưu file vào memory để controller đọc trực tiếp từ buffer
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Giới hạn dung lượng file tối đa 50MB
});

// Export middleware để sử dụng trong các route
export default upload;
