export const errorHandler = (err, req, res, next) => {
    // Default status code to 500 (internal server error)
    let statusCode = err.statusCode || 500;
    let message = err.message;


    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map((error) => error.message).join(', ');
    }

    // Handle invalid ObjectId (CastError)
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        statusCode = 400;
        message = `Invalid ${err.path}: ${err.value}`;
    }

    // Handle duplicate key errors (e.g., unique constraint violations)
    if (err.code === 11000) {
        statusCode = 400;
        const field = Object.keys(err.keyValue)[0];
        message = `Duplicate value for field '${field}'`;
    }

    if (err.name == 'TypeError') {
        statusCode = 400;
        //message = 'Invalid request body.';
        message = err.message
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 400;
        message = 'Token expired'
    }

    if (err.message && err.message.includes("sendMail")) {
        console.error("Email error:", err.message);
        return res.status(500).json({ message: "Failed to send email." });
    }

    // Handle other types of errors (if any)
    res.status(statusCode).json({
        error: {
            status: statusCode,
            message: message,
            timestamp: new Date().toISOString(),
            path: req.path,
        }
    });
};
