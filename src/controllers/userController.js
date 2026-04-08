import User from '../models/user.schema.js';

export const getStudentsController = async (req, res, next) => {
  try {
    const pageRaw = parseInt(req.query.page, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    const limit = Number.isNaN(limitRaw) ? 20 : Math.max(1, Math.min(100, limitRaw));
    const skip = (page - 1) * limit;

    const query = {
      roles: { $in: ['researchobject'] },
      isGuest: { $ne: true }
    };
    const [studentsRaw, total] = await Promise.all([
      User.find(query)
        .select('_id fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);
    const students = studentsRaw.map((student) => ({
      userId: String(student._id),
      fullName: student.fullName,
      email: student.email
    }));

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      students
    });
  } catch (error) {
    next(error);
  }
};

export default { getStudentsController };
