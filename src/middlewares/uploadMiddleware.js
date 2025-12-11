import multer from 'multer';

// Lưu file tạm trong memory
const storage = multer.memoryStorage();

// Filter chỉ cho phép video
const videoFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép upload video!'), false);
  }
};

// Upload video với giới hạn 100MB
export const uploadVideo = multer({
  storage: storage,
  fileFilter: videoFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});

// Filter chỉ cho phép image
const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ cho phép upload hình ảnh!'), false);
  }
};

// Upload image với giới hạn 5MB
export const uploadImage = multer({
  storage: storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});
