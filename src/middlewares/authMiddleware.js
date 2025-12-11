import 'dotenv/config';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';

// Lấy token từ header Authorization: Bearer <token>
const getTokenFromRequest = (req) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7); // Bỏ "Bearer "
    }
    return null;
};

const authToken = (req, res, next) => {
    const white_lists = ["/", "/register", "/login", "/refresh", "/forgot-password", "/reset-password", "/verify-account", "/verify-email", "/guest"];
    
    if (white_lists.find(item => '' + item === req.originalUrl) || req.originalUrl.startsWith('/api-docs')) {
        next();
    }
    else {
        const accessToken = getTokenFromRequest(req);
        
        if (accessToken) {
            try {
                // Verify access token
                const decode = jwt.verify(accessToken, SECRET_KEY);
                req.user = {
                    id: decode.id,
                    username: decode.username,
                    email: decode.email
                }
                next();
            } catch (error) {
                if (error.name === "TokenExpiredError") {
                    return res.status(401).json({
                        message: "Token đã hết hạn, vui lòng gọi /auth/refresh để lấy token mới"
                    })
                }
                else {
                    return res.status(401).json({
                        message: "Token không hợp lệ"
                    })
                }
            }
        }
        else {
            return res.status(401).json({
                message: "Không tìm thấy token"
            })
        }
    }
}

export { authToken };