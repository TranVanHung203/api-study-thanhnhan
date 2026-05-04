import 'dotenv/config';
import jwt from 'jsonwebtoken';
import User from '../models/user.schema.js';
import RefreshToken from '../models/refreshToken.schema.js';
import { getCurrentSessionId } from '../services/sessionService.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key';

// Lấy token từ header Authorization: Bearer <token>
const getTokenFromRequest = (req) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7); // Bỏ "Bearer "
    }
    return null;
};

// Kiểm tra xem user có refresh token active không
// Redis là lớp kiểm tra nhanh; nếu Redis lỗi hoặc lệch trạng thái thì fallback DB.
const checkUserSessionStatus = async (userId, refreshTokenId = null) => {
    try {
        if (!refreshTokenId) {
            return { isValid: false, source: 'invalid' };
        }

        const currentSessionResult = await getCurrentSessionId(userId);
        if (currentSessionResult.ok && currentSessionResult.value) {
            if (String(currentSessionResult.value) === String(refreshTokenId)) {
                return { isValid: true, source: 'redis' };
            }
        }

        const tokenDoc = await RefreshToken.findOne({
            _id: refreshTokenId,
            userId: userId,
            isRevoked: false,
            expiresAt: { $gt: new Date() }
        });
        return {
            isValid: !!tokenDoc,
            source: tokenDoc ? 'db-fallback' : 'invalid'
        };
    } catch (error) {
        console.error('Lỗi khi kiểm tra session status:', error);

        if (!refreshTokenId) {
            return { isValid: false, source: 'invalid' };
        }

        const tokenDoc = await RefreshToken.findOne({
            _id: refreshTokenId,
            userId: userId,
            isRevoked: false,
            expiresAt: { $gt: new Date() }
        });
        return {
            isValid: !!tokenDoc,
            source: tokenDoc ? 'db-fallback' : 'invalid'
        };
    }
};

const authToken = async (req, res, next) => {
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
                const refreshTokenIdFromToken = decode.refreshTokenId || null;
                req.user = {
                    id: decode.id,
                    username: decode.username,
                    email: decode.email,
                    refreshTokenId: refreshTokenIdFromToken
                }
                
                // Kiểm tra xem user có refresh token active không (ưu tiên kiểm tra token id cụ thể)
                const sessionCheck = await checkUserSessionStatus(req.user.id, refreshTokenIdFromToken);
                req.user.sessionSource = sessionCheck.source;
                res.setHeader('X-Session-Check-Source', sessionCheck.source);
                
                if (!sessionCheck.isValid) {
                    return res.status(401).json({
                        message: "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.",
                        code: "SESSION_REVOKED"
                    });
                }

                if (sessionCheck.source === 'db-fallback') {
                    console.warn(`[Auth] Redis unavailable or mismatched, used DB fallback for user ${req.user.id}`);
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

const requireGuest = async (req, res, next) => {
  try {
        const user = await User.findOne({ _id: req.user.id, isStatus: { $ne: 'deleted' } })
            .select('isGuest');
    if (!user || !user.isGuest) {
      return res.status(403).json({ message: 'Chỉ tài khoản khách mới được phép thực hiện thao tác này' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

export { authToken, requireGuest };