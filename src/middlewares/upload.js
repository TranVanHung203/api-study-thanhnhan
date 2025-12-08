import multer from 'multer';
import path from 'path';

// Cấu hình storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Đường dẫn lưu file tại gốc dự án
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Tên file duy nhất
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 } // Giới hạn dung lượng file tối đa 50MB
});

// Export middleware để sử dụng trong các route
export default upload;
