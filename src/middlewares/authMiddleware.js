import 'dotenv/config';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';

// Helper function để lấy token từ header hoặc cookie
const getTokenFromRequest = (req) => {
    // 1. Ưu tiên lấy từ header Authorization: Bearer <token>
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7); // Bỏ "Bearer "
    }
    
    // 2. Nếu không có header thì lấy từ cookie
    if (req?.cookies?.access_token) {
        return req.cookies.access_token;
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
                    // Access token hết hạn, kiểm tra refresh token
                    if (req?.cookies?.refresh_token) {
                        const refreshToken = req?.cookies?.refresh_token;
                        try {
                            const decodeRefresh = jwt.verify(refreshToken, SECRET_KEY);
                            
                            // Tạo access token mới
                            const payload = {
                                id: decodeRefresh.id,
                                username: decodeRefresh.username,
                                email: decodeRefresh.email
                            }
                            const newAccessToken = jwt.sign(payload, SECRET_KEY, {
                                expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
                            });
                            
                            // Lưu vào cookie
                            res.cookie('access_token', newAccessToken, {
                                httpOnly: true,
                                secure: false,
                                maxAge: 15 * 60 * 1000
                            });
                            
                            req.user = {
                                id: decodeRefresh.id,
                                username: decodeRefresh.username,
                                email: decodeRefresh.email
                            }
                            next();
                        } catch (error) {
                            return res.status(401).json({
                                message: "Refresh token không hợp lệ"
                            })
                        }
                    }
                    else {
                        return res.status(401).json({
                            message: "Token đã hết hạn"
                        })
                    }
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