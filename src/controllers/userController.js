import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';
import path from 'path';
import fs from 'fs';
import cloudinary from '../config/cloudinaryConfig.js';
import User from '../models/user.schema.js';
import SchoolClass from '../models/schoolClass.schema.js';
import UserSchoolClass from '../models/userSchoolClass.schema.js';
import TeacherSchoolClass from '../models/teacherSchoolClass.schema.js';
import ParentInfo from '../models/parentInfo.schema.js';
import UserActivity from '../models/userActivity.schema.js';
import Reward from '../models/reward.schema.js';
import Rating from '../models/rating.schema.js';
import QuizAttempt from '../models/quizAttempt.schema.js';
import LessonCompletion from '../models/lessonCompletion.schema.js';
import VideoWatch from '../models/videoWatch.schema.js';
import QuizSession from '../models/quizSession.schema.js';
import BulkAvatarUploadJob from '../models/bulkAvatarUploadJob.schema.js';
import { getOnlineUserIds, getPresenceByUserIds } from '../services/presenceService.js';
import { emitAuthUserEvent } from '../ws/authSocket.js';

const hasRole = (user, roleName) => {
  if (!Array.isArray(user?.roles)) return false;
  const normalizedRoleName = String(roleName || '').toLowerCase();
  return user.roles.some((role) => String(role).toLowerCase() === normalizedRoleName);
};

const normalizeSearchText = (value) => String(value || '')
  .trim()
  .replace(/[Đ]/g, 'D')
  .replace(/[đ]/g, 'd')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const normalizeOptionalText = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeDateOfBirth = (value) => {
  if (value === undefined) return { hasValue: false, value: undefined, error: null };
  if (value === null || value === '') return { hasValue: true, value: null, error: null };

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return { hasValue: true, value: null, error: 'dateOfBirth khong hop le' };
  }

  return { hasValue: true, value: parsedDate, error: null };
};

const normalizePlainText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[đ]/g, 'd')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const parseGenderValue = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { hasValue: false, value: undefined, error: null };
  }

  const normalized = normalizePlainText(value);
  if (normalized === '1' || normalized === 'nam' || normalized === 'male') {
    return { hasValue: true, value: 1, error: null };
  }
  if (normalized === '0' || normalized === 'nu' || normalized === 'female') {
    return { hasValue: true, value: 0, error: null };
  }

  return { hasValue: true, value: null, error: 'Giới tính chỉ nhận Nam/Nữ hoặc 1/0' };
};

const normalizePhoneFromExcel = (value) => {
  if (value === undefined || value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Excel may serialize typed phone as number (e.g. 901234567 or 901234567.0).
  const numericLike = raw.replace(/\.0+$/, '');
  if (/^\d+$/.test(numericLike)) {
    if (numericLike.length === 9 && !numericLike.startsWith('0')) {
      return `0${numericLike}`;
    }
    return numericLike;
  }

  return raw;
};

const normalizeAvatarCode = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const parsedWithoutExt = path.parse(raw).name;
  const normalized = String(parsedWithoutExt || raw)
    .trim()
    .toLowerCase();

  return normalized || null;
};

const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const resolveImageExtFromUploadFile = (file) => {
  if (!file) return null;
  const nameExt = path.extname(String(file.originalname || '')).toLowerCase();
  if (imageExtensions.includes(nameExt)) return nameExt;

  const mime = String(file.mimetype || '').toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return null;
};

const generateStudentUserCodesForBulkInsert = async (count) => {
  const total = Number(count) || 0;
  if (total <= 0) return [];

  const year = new Date().getFullYear();
  const codePrefix = `HS${year}_`;
  const escapedPrefix = codePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const latestRows = await User.aggregate([
    { $match: { userCode: { $regex: `^${escapedPrefix}` } } },
    {
      $project: {
        sequence: {
          $convert: {
            input: { $arrayElemAt: [{ $split: ['$userCode', '_'] }, 1] },
            to: 'int',
            onError: 0,
            onNull: 0
          }
        }
      }
    },
    { $sort: { sequence: -1 } },
    { $limit: 1 }
  ]);

  let nextSequence = (latestRows?.[0]?.sequence || 0) + 1;
  const userCodes = [];
  for (let i = 0; i < total; i++) {
    userCodes.push(`${codePrefix}${nextSequence}`);
    nextSequence += 1;
  }
  return userCodes;
};

const buildAvatarBufferMapFromArchive = async ({
  archiveBuffer,
  fileName,
  mimeType,
  wantedCodes = null
}) => {
  const avatarBufferMap = new Map();
  if (!archiveBuffer || !Buffer.isBuffer(archiveBuffer)) return avatarBufferMap;

  const lowerName = String(fileName || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  const isRar = lowerName.endsWith('.rar') || lowerMime.includes('rar');
  const isZip = lowerName.endsWith('.zip') || lowerMime.includes('zip');

  if (isRar) {
    const arrayBuffer = archiveBuffer.buffer.slice(
      archiveBuffer.byteOffset,
      archiveBuffer.byteOffset + archiveBuffer.byteLength
    );

    const extractor = await createExtractorFromData({ data: arrayBuffer });
    const extracted = extractor.extract({});
    const files = [...extracted.files];

    for (const file of files) {
      if (!file?.fileHeader || file.fileHeader.flags?.directory) continue;
      const entryName = path.basename(file.fileHeader.name || '').trim();
      if (!entryName) continue;

      const ext = path.extname(entryName).toLowerCase();
      if (!imageExtensions.includes(ext)) continue;

      const code = normalizeAvatarCode(entryName);
      if (!code || avatarBufferMap.has(code)) continue;
      if (wantedCodes && !wantedCodes.has(code)) continue;

      const extraction = file.extraction ? Buffer.from(file.extraction) : null;
      if (!extraction || extraction.length === 0) continue;

      avatarBufferMap.set(code, { buffer: extraction, ext });
    }

    return avatarBufferMap;
  }

  if (isZip || (!isRar && !isZip)) {
    const zip = new AdmZip(archiveBuffer);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = path.basename(entry.entryName || '').trim();
      if (!entryName) continue;

      const ext = path.extname(entryName).toLowerCase();
      if (!imageExtensions.includes(ext)) continue;

      const code = normalizeAvatarCode(entryName);
      if (!code || avatarBufferMap.has(code)) continue;
      if (wantedCodes && !wantedCodes.has(code)) continue;

      const buffer = entry.getData();
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) continue;

      avatarBufferMap.set(code, { buffer, ext });
    }
  }

  return avatarBufferMap;
};

const uploadAvatarBufferToCloudinary = async ({ buffer, username, avatarCode, ext }) =>
  new Promise((resolve, reject) => {
    const safeUser = String(username || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeCode = String(avatarCode || 'avatar').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileExt = String(ext || '').replace('.', '') || 'jpg';

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        folder: 'student_avatars',
        public_id: `${safeUser}_${safeCode}`,
        overwrite: true,
        format: fileExt
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

const buildAvatarPublicId = (username, avatarCode) => {
  const safeUser = String(username || 'student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeCode = String(avatarCode || 'avatar').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeUser}_${safeCode}`;
};

const avatarUrlContainsPublicId = (avatarUrl, publicId) => {
  if (!avatarUrl || !publicId) return false;
  return String(avatarUrl).includes(`/student_avatars/${publicId}.`);
};

const runWithConcurrency = async (items, worker, concurrency = 4) => {
  const safeConcurrency = Math.max(1, Number(concurrency) || 1);
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = new Array(items.length);
  let nextIndex = 0;

  const runner = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  };

  const workers = Array.from({ length: Math.min(safeConcurrency, items.length) }, () => runner());
  await Promise.all(workers);
  return results;
};

const createBulkAvatarJob = async ({ teacherId, schoolClassId, totalAssignments, totalCodes }) => {
  const job = await BulkAvatarUploadJob.create({
    teacherId,
    schoolClassId: schoolClassId || null,
    status: 'pending',
    progress: {
      totalAssignments: Number(totalAssignments) || 0,
      totalCodes: Number(totalCodes) || 0,
      processedCodes: 0
    },
    result: {
      avatarUploaded: 0,
      avatarMissing: 0,
      avatarCleared: 0,
      usersUpdated: 0
    },
    errors: [],
    performanceMs: {
      avatarProcessingMs: 0
    },
    startedAt: null,
    finishedAt: null
  });

  return job;
};

const serializeBulkAvatarJob = (jobDoc, options = {}) => {
  const { includePerformanceMs = false } = options;
  if (!jobDoc) return null;
  const job = typeof jobDoc.toObject === 'function' ? jobDoc.toObject() : jobDoc;
  const serialized = {
    jobId: String(job._id),
    status: job.status,
    createdAt: job.createdAt || null,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    progress: job.progress || {
      totalAssignments: 0,
      totalCodes: 0,
      processedCodes: 0
    },
    result: job.result || {
      avatarUploaded: 0,
      avatarMissing: 0,
      avatarCleared: 0,
      usersUpdated: 0
    },
    errors: job.errors || []
  };

  if (includePerformanceMs) {
    serialized.performanceMs = job.performanceMs || { avatarProcessingMs: 0 };
  }

  return serialized;
};

const emitBulkAvatarJobRealtime = (teacherId, jobPayload) => {
  if (!teacherId || !jobPayload?.jobId) return;
  emitAuthUserEvent(String(teacherId), 'users:bulk-avatar-job', {
    job: jobPayload
  });
};

const processAvatarAssignments = async ({
  avatarAssignments,
  avatarBufferMap,
  avatarUploadConcurrency = 4,
  onCodeProcessed = null
}) => {
  const avatarUpdateOps = [];
  const uploadedAvatarUrlByCode = new Map();
  const assignmentsByCode = new Map();
  const counts = {
    avatarUploaded: 0,
    avatarMissing: 0,
    avatarCleared: 0
  };
  const errors = [];

  for (const assignment of avatarAssignments) {
    if (!assignment.avatarReplaceCode) continue;
    if (!assignmentsByCode.has(assignment.avatarReplaceCode)) {
      assignmentsByCode.set(assignment.avatarReplaceCode, []);
    }
    assignmentsByCode.get(assignment.avatarReplaceCode).push(assignment);
  }

  const uniqueAvatarCodes = Array.from(assignmentsByCode.keys());

  await runWithConcurrency(
    uniqueAvatarCodes,
    async (replaceCode) => {
      const codeAssignments = assignmentsByCode.get(replaceCode) || [];
      const firstAssignment = codeAssignments[0];
      const reusedUrl = codeAssignments
        .map((assignment) => {
          const publicId = buildAvatarPublicId(assignment.username, replaceCode);
          if (avatarUrlContainsPublicId(assignment.oldAvatarUrl, publicId)) {
            return assignment.oldAvatarUrl;
          }
          return null;
        })
        .find(Boolean);

      if (reusedUrl) {
        uploadedAvatarUrlByCode.set(replaceCode, reusedUrl);
        if (typeof onCodeProcessed === 'function') await onCodeProcessed(replaceCode);
        return;
      }

      if (!avatarBufferMap.has(replaceCode)) {
        uploadedAvatarUrlByCode.set(replaceCode, null);
        if (typeof onCodeProcessed === 'function') await onCodeProcessed(replaceCode);
        return;
      }

      const avatarAsset = avatarBufferMap.get(replaceCode);
      try {
        const uploadResult = await uploadAvatarBufferToCloudinary({
          buffer: avatarAsset.buffer,
          username: firstAssignment?.username,
          avatarCode: replaceCode,
          ext: avatarAsset.ext
        });
        uploadedAvatarUrlByCode.set(replaceCode, uploadResult?.secure_url || null);
      } catch (avatarErr) {
        uploadedAvatarUrlByCode.set(replaceCode, null);
        if (firstAssignment) {
          errors.push({
            row: firstAssignment.rowIndex,
            message: `Khong the upload avatar cho ma '${replaceCode}'`
          });
        }
      }

      if (typeof onCodeProcessed === 'function') await onCodeProcessed(replaceCode);
    },
    avatarUploadConcurrency
  );

  for (const assignment of avatarAssignments) {
    const replaceCode = assignment.avatarReplaceCode;
    let finalAvatarUrl = assignment.oldAvatarUrl || null;

    if (replaceCode) {
      const uploadedUrl = uploadedAvatarUrlByCode.get(replaceCode);
      if (uploadedUrl) {
        finalAvatarUrl = uploadedUrl;
        counts.avatarUploaded += 1;
      } else {
        counts.avatarMissing += 1;
      }
    }

    if (!finalAvatarUrl && assignment.oldAvatarUrl) {
      counts.avatarCleared += 1;
    }

    if ((assignment.oldAvatarUrl || null) !== (finalAvatarUrl || null)) {
      avatarUpdateOps.push({
        updateOne: {
          filter: { _id: assignment.userId },
          update: { $set: { avatarUrl: finalAvatarUrl || null } }
        }
      });
    }
  }

  if (avatarUpdateOps.length) {
    await User.bulkWrite(avatarUpdateOps, { ordered: false });
  }

  return {
    ...counts,
    usersUpdated: avatarUpdateOps.length,
    totalCodes: uniqueAvatarCodes.length,
    errors
  };
};

const runBulkAvatarJobInBackground = async ({
  job,
  avatarAssignments,
  avatarBufferMap,
  avatarUploadConcurrency
}) => {
  const startedAt = Date.now();
  const jobId = job?._id;
  const totalCodes = Number(job?.progress?.totalCodes || 0);
  const teacherId = String(job?.teacherId || '');
  const startedAtDate = new Date();

  await BulkAvatarUploadJob.updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'running',
        startedAt: startedAtDate
      }
    }
  );
  emitBulkAvatarJobRealtime(
    teacherId,
    serializeBulkAvatarJob({
      ...job.toObject(),
      status: 'running',
      startedAt: startedAtDate
    })
  );

  try {
    let processedCodes = 0;
    let lastPersistAt = 0;
    const avatarResult = await processAvatarAssignments({
      avatarAssignments,
      avatarBufferMap,
      avatarUploadConcurrency,
      onCodeProcessed: async () => {
        processedCodes += 1;
        const now = Date.now();
        const shouldPersist = (
          processedCodes === totalCodes
          || processedCodes % 5 === 0
          || now - lastPersistAt >= 1500
        );
        if (shouldPersist) {
          lastPersistAt = now;
          await BulkAvatarUploadJob.updateOne(
            { _id: jobId },
            { $set: { 'progress.processedCodes': processedCodes } }
          );
          emitBulkAvatarJobRealtime(
            teacherId,
            serializeBulkAvatarJob({
              ...job.toObject(),
              status: 'running',
              startedAt: startedAtDate,
              progress: {
                ...(job.progress || {}),
                processedCodes
              }
            })
          );
        }
      }
    });

    const finishedAtDate = new Date();
    await BulkAvatarUploadJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          finishedAt: finishedAtDate,
          'progress.processedCodes': totalCodes || processedCodes,
          result: {
            avatarUploaded: avatarResult.avatarUploaded,
            avatarMissing: avatarResult.avatarMissing,
            avatarCleared: avatarResult.avatarCleared,
            usersUpdated: avatarResult.usersUpdated
          },
          errors: avatarResult.errors || [],
          performanceMs: {
            avatarProcessingMs: Date.now() - startedAt
          }
        }
      }
    );
    emitBulkAvatarJobRealtime(
      teacherId,
      serializeBulkAvatarJob({
        ...job.toObject(),
        status: 'completed',
        startedAt: startedAtDate,
        finishedAt: finishedAtDate,
        progress: {
          ...(job.progress || {}),
          processedCodes: totalCodes || processedCodes
        },
        result: {
          avatarUploaded: avatarResult.avatarUploaded,
          avatarMissing: avatarResult.avatarMissing,
          avatarCleared: avatarResult.avatarCleared,
          usersUpdated: avatarResult.usersUpdated
        },
        errors: avatarResult.errors || [],
        performanceMs: {
          avatarProcessingMs: Date.now() - startedAt
        }
      })
    );
  } catch (error) {
    const finishedAtDate = new Date();
    await BulkAvatarUploadJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'failed',
          finishedAt: finishedAtDate,
          errors: [{ message: error?.message || 'Loi xu ly avatar job' }],
          performanceMs: {
            avatarProcessingMs: Date.now() - startedAt
          }
        }
      }
    );
    emitBulkAvatarJobRealtime(
      teacherId,
      serializeBulkAvatarJob({
        ...job.toObject(),
        status: 'failed',
        startedAt: startedAtDate,
        finishedAt: finishedAtDate,
        errors: [{ message: error?.message || 'Loi xu ly avatar job' }],
        performanceMs: {
          avatarProcessingMs: Date.now() - startedAt
        }
      })
    );
  }
};

const enforceTextColumns = (ws, columnIndexes, rowCount, reserveRows = 500) => {
  if (!ws['!cols']) ws['!cols'] = [];
  const maxRow = Math.max((rowCount || 0) + 1, reserveRows);
  const existingRange = ws['!ref']
    ? XLSX.utils.decode_range(ws['!ref'])
    : { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
  const targetEndCol = Math.max(existingRange.e.c, ...columnIndexes);
  const targetEndRow = Math.max(existingRange.e.r, maxRow);

  ws['!ref'] = XLSX.utils.encode_range({
    s: existingRange.s,
    e: { c: targetEndCol, r: targetEndRow }
  });

  for (const colIndex of columnIndexes) {
    if (!ws['!cols'][colIndex]) ws['!cols'][colIndex] = {};
    ws['!cols'][colIndex].z = '@';

    for (let r = 1; r <= maxRow; r++) {
      const cellRef = XLSX.utils.encode_cell({ c: colIndex, r });
      if (!ws[cellRef]) {
        ws[cellRef] = { t: 's', v: '', z: '@' };
      } else {
        ws[cellRef].t = 's';
        ws[cellRef].v = ws[cellRef].v == null ? '' : String(ws[cellRef].v);
        ws[cellRef].z = '@';
      }
    }
  }
};

const parsePagination = (query) => {
  const pageRaw = parseInt(query?.page, 10);
  const limitRaw = parseInt(query?.limit, 10);
  const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
  const limit = Number.isNaN(limitRaw) ? 20 : Math.max(1, Math.min(100, limitRaw));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const getMinutesAgo = (dateValue, now = new Date()) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
};

const buildPresencePayload = (user, now = new Date()) => {
  const isOnline = user?.isOnline === true;
  const onlineAt = user?.onlineAt || null;
  const lastSeenAt = user?.lastSeenAt || null;

  return {
    isOnline,
    onlineAt,
    onlineForMinutes: isOnline ? getMinutesAgo(onlineAt, now) : null,
    lastSeenAt,
    lastSeenMinutesAgo: lastSeenAt ? getMinutesAgo(lastSeenAt, now) : null
  };
};

const getTeacherContext = async (teacherId) => {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    return { error: { status: 401, message: 'Thong tin dang nhap khong hop le' } };
  }

  const teacher = await User.findOne({ _id: teacherId, isStatus: { $ne: 'deleted' } })
    .select('_id roles schoolId')
    .lean();
  if (!teacher) {
    return { error: { status: 404, message: 'Giao vien khong ton tai' } };
  }
  if (!hasRole(teacher, 'teacher')) {
    return { error: { status: 403, message: 'Chi tai khoan giao vien moi duoc phep thao tac' } };
  }
  if (!teacher.schoolId) {
    return { error: { status: 400, message: 'Giao vien chua duoc gan schoolId' } };
  }

  const managedMappings = await TeacherSchoolClass.find({ teacherId: teacher._id }).select('schoolClassId').lean();
  const managedClassIds = managedMappings
    .map((item) => String(item.schoolClassId))
    .filter(Boolean);

  return {
    teacher,
    managedClassIds,
    managedClassIdSet: new Set(managedClassIds)
  };
};

const validateManagedSchoolClass = async (teacherContext, schoolClassId) => {
  if (!mongoose.Types.ObjectId.isValid(schoolClassId)) {
    return { error: { status: 400, message: 'schoolClassId khong hop le' } };
  }

  const classIdStr = String(schoolClassId);
  if (!teacherContext.managedClassIdSet.has(classIdStr)) {
    return { error: { status: 403, message: 'Giáo viên không được quản lý lớp học này' } };
  }

  const schoolClass = await SchoolClass.findById(classIdStr).select('_id className schoolId').lean();
  if (!schoolClass) {
    return { error: { status: 404, message: 'Lớp học không tồn tại' } };
  }

  if (String(schoolClass.schoolId) !== String(teacherContext.teacher.schoolId)) {
    return { error: { status: 403, message: 'Lớp học không thuộc trường của giáo viên' } };
  }

  return { schoolClass };
};

export const getStudentsController = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const query = {
      roles: { $in: ['researchobject'] },
      isGuest: { $ne: true },
      isStatus: { $ne: 'deleted' }
    };
    const [studentsRaw, total] = await Promise.all([
      User.find(query)
        .select('_id userCode fullName email isOnline onlineAt lastSeenAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query)
    ]);
    const presenceResult = await getPresenceByUserIds(studentsRaw.map((student) => student._id));
    const students = studentsRaw.map((student) => ({
      userId: String(student._id),
      userCode: student.userCode || null,
      fullName: student.fullName,
      email: student.email,
      presence: buildPresencePayload({
        ...student,
        ...(presenceResult.presenceByUserId.get(String(student._id)) || {}),
        isOnline: presenceResult.presenceByUserId.has(String(student._id)) || student.isOnline === true
      })
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

export const createStudentByTeacherController = async (req, res, next) => {
  try {
    const avatarFile = req.file || null;
    let avatarExt = null;
    if (avatarFile) {
      avatarExt = resolveImageExtFromUploadFile(avatarFile);
      if (!avatarExt) {
        return res.status(400).json({ message: 'imageFile phai la file anh jpg/jpeg/png/webp/gif' });
      }
      if (!avatarFile.buffer || !Buffer.isBuffer(avatarFile.buffer) || avatarFile.buffer.length === 0) {
        return res.status(400).json({ message: 'File imageFile khong hop le' });
      }
    }

    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giao vien chua duoc gan lop quan ly' });
    }

    const {
      username,
      password,
      fullName,
      gender,
      schoolClassId,
      dateOfBirth,
      address,
      fatherName,
      fatherPhone,
      motherName,
      motherPhone
    } = req.body || {};

    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '');
    const normalizedFullName = String(fullName || '').trim();
    const normalizedAddress = normalizeOptionalText(address);
    const normalizedFatherName = normalizeOptionalText(fatherName);
    const normalizedFatherPhone = normalizeOptionalText(fatherPhone);
    const normalizedMotherName = normalizeOptionalText(motherName);
    const normalizedMotherPhone = normalizeOptionalText(motherPhone);
    const dobResult = normalizeDateOfBirth(dateOfBirth);

    if (!normalizedUsername || !normalizedPassword || !normalizedFullName || !schoolClassId) {
      return res.status(400).json({
        message: 'username, password, fullName, schoolClassId la bat buoc'
      });
    }

    if (normalizedPassword.length < 6) {
      return res.status(400).json({ message: 'password toi thieu 6 ky tu' });
    }

    if (gender !== undefined && gender !== null && ![0, 1].includes(Number(gender))) {
      return res.status(400).json({ message: 'gender chi nhan 0 hoac 1' });
    }

    if (dobResult.error) {
      return res.status(400).json({ message: dobResult.error });
    }

    const schoolClassResult = await validateManagedSchoolClass(teacherContext, schoolClassId);
    if (schoolClassResult.error) {
      return res.status(schoolClassResult.error.status).json({ message: schoolClassResult.error.message });
    }

    const existingUsername = await User.findOne({ username: normalizedUsername }).select('_id').lean();

    if (existingUsername) {
      return res.status(409).json({ message: 'username da ton tai' });
    }

    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    let user;
    try {
      user = await User.create({
        username: normalizedUsername,
        passwordHash,
        fullName: normalizedFullName,
        gender: gender === undefined || gender === null ? undefined : Number(gender),
        dateOfBirth: dobResult.hasValue ? dobResult.value : null,
        address: normalizedAddress,
        roles: ['student'],
        provider: 'local',
        isGuest: false,
        classId: null,
        schoolId: teacherContext.teacher.schoolId,
        createdByTeacherId: teacherContext.teacher._id
      });
    } catch (createError) {
      if (createError?.code === 11000) {
        const duplicatedField = Object.keys(createError?.keyPattern || {})[0] || 'unknown';
        return res.status(409).json({ message: `Du lieu bi trung (${duplicatedField})` });
      }
      throw createError;
    }

    await UserSchoolClass.create({ userId: user._id, schoolClassId: schoolClassResult.schoolClass._id });

    const parentInfoPayload = {
      fatherName: normalizedFatherName,
      fatherPhone: normalizedFatherPhone,
      motherName: normalizedMotherName,
      motherPhone: normalizedMotherPhone
    };
    const hasParentInfo = Object.values(parentInfoPayload).some((value) => value !== null);
    const createdParentInfo = hasParentInfo
      ? await ParentInfo.create({
          studentId: user._id,
          ...parentInfoPayload
        })
      : null;

    let avatarUploadError = null;
    if (avatarFile && avatarExt) {
      try {
        const uploadResult = await uploadAvatarBufferToCloudinary({
          buffer: avatarFile.buffer,
          username: user.username,
          avatarCode: 'profile',
          ext: avatarExt
        });
        const avatarUrl = uploadResult?.secure_url || null;
        if (avatarUrl) {
          await User.updateOne({ _id: user._id }, { $set: { avatarUrl } });
          user.avatarUrl = avatarUrl;
        }
      } catch (avatarError) {
        avatarUploadError = 'Khong the upload avatar, tai khoan da tao voi avatarUrl = null';
      }
    }

    return res.status(201).json({
      message: 'Giao vien tao tai khoan hoc sinh thanh cong',
      avatarUploadError,
      student: {
        userId: user._id,
        userCode: user.userCode || null,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        gender: user.gender ?? null,
        schoolId: user.schoolId,
        schoolClass: {
          schoolClassId: schoolClassResult.schoolClass._id,
          className: schoolClassResult.schoolClass.className
        },
        dateOfBirth: user.dateOfBirth || null,
        address: user.address || null,
        parentInfo: createdParentInfo
          ? {
              parentInfoId: createdParentInfo._id,
              fatherName: createdParentInfo.fatherName || null,
              fatherPhone: createdParentInfo.fatherPhone || null,
              motherName: createdParentInfo.motherName || null,
              motherPhone: createdParentInfo.motherPhone || null
            }
          : null
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Du lieu bi trung (username)' });
    }
    next(error);
  }
};

export const getTeacherManagedStudentsController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const schoolClassIdQuery = typeof req.query.schoolClassId === 'string'
      ? req.query.schoolClassId.trim()
      : '';
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    if (!teacherContext.managedClassIds.length) {
      return res.status(200).json({
        page,
        limit,
        total: 0,
        totalPages: 0,
        students: []
      });
    }

    let scopedClassIds = teacherContext.managedClassIds;
    if (schoolClassIdQuery) {
      if (!mongoose.Types.ObjectId.isValid(schoolClassIdQuery)) {
        return res.status(400).json({ message: 'schoolClassId khong hop le' });
      }

      if (!teacherContext.managedClassIdSet.has(schoolClassIdQuery)) {
        return res.status(403).json({ message: 'Giáo viên không được xem lớp học này' });
      }
      scopedClassIds = [schoolClassIdQuery];
    }

    const mappings = await UserSchoolClass.find({
      schoolClassId: { $in: scopedClassIds }
    })
      .select('userId schoolClassId')
      .lean();

    if (!mappings.length) {
      return res.status(200).json({
        page,
        limit,
        total: 0,
        totalPages: 0,
        students: []
      });
    }

    const userIdToClassIdsMap = new Map();
    for (const mapping of mappings) {
      const userIdStr = String(mapping.userId);
      const schoolClassIdStr = String(mapping.schoolClassId);
      if (!userIdToClassIdsMap.has(userIdStr)) {
        userIdToClassIdsMap.set(userIdStr, []);
      }
      userIdToClassIdsMap.get(userIdStr).push(schoolClassIdStr);
    }

    const allCandidateUserIds = Array.from(userIdToClassIdsMap.keys());
    const userFilter = {
      _id: { $in: allCandidateUserIds },
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isGuest: { $ne: true },
      isStatus: { $ne: 'deleted' }
    };

    let total;
    let users;

    if (searchQuery) {
      const normalizedSearch = normalizeSearchText(searchQuery);
      const allUsers = await User.find(userFilter)
        .select('_id userCode username fullName email gender schoolId dateOfBirth address avatarUrl createdAt isOnline onlineAt lastSeenAt')
        .sort({ createdAt: -1 })
        .lean();

      const filteredUsers = allUsers.filter((user) => {
        const normalizedFullName = normalizeSearchText(user.fullName);
        const normalizedUsername = normalizeSearchText(user.username);
        const normalizedEmail = normalizeSearchText(user.email);
        const normalizedUserCode = normalizeSearchText(user.userCode);

        return (
          normalizedFullName.includes(normalizedSearch) ||
          normalizedUsername.includes(normalizedSearch) ||
          normalizedEmail.includes(normalizedSearch) ||
          normalizedUserCode.includes(normalizedSearch)
        );
      });

      total = filteredUsers.length;
      users = filteredUsers.slice(skip, skip + limit);
    } else {
      [total, users] = await Promise.all([
        User.countDocuments(userFilter),
        User.find(userFilter)
          .select('_id userCode username fullName email gender schoolId dateOfBirth address avatarUrl createdAt isOnline onlineAt lastSeenAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
      ]);
    }

    if (!users.length) {
      return res.status(200).json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        students: []
      });
    }

    const pageUserIds = users.map((user) => user._id);
    const pageUserIdStrSet = new Set(pageUserIds.map((id) => String(id)));
    const classIdsForPage = new Set();

    for (const [userIdStr, schoolClassIds] of userIdToClassIdsMap.entries()) {
      if (!pageUserIdStrSet.has(userIdStr)) continue;
      schoolClassIds.forEach((schoolClassId) => classIdsForPage.add(schoolClassId));
    }

    const [schoolClasses, presenceResult, parentInfos] = await Promise.all([
      SchoolClass.find({ _id: { $in: Array.from(classIdsForPage) } })
        .select('_id className schoolId')
        .lean(),
      getPresenceByUserIds(users.map((user) => user._id)),
      ParentInfo.find({ studentId: { $in: pageUserIds } })
        .select('_id studentId fatherName fatherPhone motherName motherPhone')
        .lean()
    ]);

    const classMap = new Map(schoolClasses.map((item) => [String(item._id), item]));
    const parentInfoMap = new Map(parentInfos.map((item) => [String(item.studentId), item]));
    const students = users.map((user) => {
      const userIdStr = String(user._id);
      const schoolClassIds = userIdToClassIdsMap.get(userIdStr) || [];
      const parentInfo = parentInfoMap.get(userIdStr) || null;
      const classList = schoolClassIds
        .map((classId) => classMap.get(classId))
        .filter(Boolean)
        .map((schoolClass) => ({
          schoolClassId: schoolClass._id,
          className: schoolClass.className
        }));

      return {
        userId: user._id,
        userCode: user.userCode || null,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        gender: user.gender ?? null,
        schoolId: user.schoolId,
        schoolClasses: classList,
        dateOfBirth: user.dateOfBirth || null,
        address: user.address || null,
        parentInfo: parentInfo
          ? {
              parentInfoId: parentInfo._id,
              fatherName: parentInfo.fatherName || null,
              fatherPhone: parentInfo.fatherPhone || null,
              motherName: parentInfo.motherName || null,
              motherPhone: parentInfo.motherPhone || null
            }
          : null,
        presence: buildPresencePayload({
          ...user,
          ...(presenceResult.presenceByUserId.get(userIdStr) || {}),
          isOnline: presenceResult.presenceByUserId.has(userIdStr) || user.isOnline === true
        })
      };
    });

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

export const getOnlineUsersController = async (req, res, next) => {
  try {
    const onlineResult = await getOnlineUserIds();
    const onlineUserIds = onlineResult.userIds;
    const now = new Date();

    if (onlineUserIds.length === 0) {
      return res.status(200).json({
        total: 0,
        source: onlineResult.source,
        users: []
      });
    }

    const presenceResult = await getPresenceByUserIds(onlineUserIds);
    const users = await User.find({
      _id: { $in: onlineUserIds },
      isStatus: { $ne: 'deleted' }
    })
      .select('_id userCode username fullName email roles avatar isOnline onlineAt lastSeenAt')
      .sort({ fullName: 1 })
      .lean();

    return res.status(200).json({
      total: users.length,
      source: presenceResult.source,
      users: users.map((user) => ({
        userId: user._id,
        userCode: user.userCode || null,
        username: user.username || null,
        fullName: user.fullName,
        email: user.email || null,
        avatar: user.avatar || null,
        roles: user.roles || [],
        presence: {
          ...buildPresencePayload({
            ...user,
            ...(presenceResult.presenceByUserId.get(String(user._id)) || {}),
            isOnline: true
          }, now),
          socketConnected: true
        }
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const updateTeacherManagedStudentController = async (req, res, next) => {
  try {
    const avatarFile = req.file || null;
    let avatarExt = null;
    if (avatarFile) {
      avatarExt = resolveImageExtFromUploadFile(avatarFile);
      if (!avatarExt) {
        return res.status(400).json({ message: 'imageFile phai la file anh jpg/jpeg/png/webp/gif' });
      }
      if (!avatarFile.buffer || !Buffer.isBuffer(avatarFile.buffer) || avatarFile.buffer.length === 0) {
        return res.status(400).json({ message: 'File imageFile khong hop le' });
      }
    }

    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giáo viên chưa được gán lớp quản lý' });
    }

    const { studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'studentId không hợp lệ' });
    }

    const student = await User.findOne({
      _id: studentId,
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isStatus: { $ne: 'deleted' }
    });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy học sinh thuộc quản lý của giáo viên' });
    }

    const hasManagedClassMapping = await UserSchoolClass.findOne({
      userId: student._id,
      schoolClassId: { $in: teacherContext.managedClassIds }
    })
      .select('_id')
      .lean();

    if (!hasManagedClassMapping) {
      return res.status(403).json({ message: 'Học sinh hiện không nằm trong lớp giáo viên đang quản lý' });
    }

    const {
      username,
      fullName,
      gender,
      password,
      schoolClassId,
      dateOfBirth,
      address,
      fatherName,
      fatherPhone,
      motherName,
      motherPhone
    } = req.body || {};

    if (username !== undefined) {
      const normalizedUsername = String(username || '').trim();
      if (!normalizedUsername) {
        return res.status(400).json({ message: 'username không được để trống' });
      }
      if (normalizedUsername !== student.username) {
        const existed = await User.findOne({
          _id: { $ne: student._id },
          username: normalizedUsername
        })
          .select('_id')
          .lean();
        if (existed) {
          return res.status(409).json({ message: 'username đã tồn tại' });
        }
      }
      student.username = normalizedUsername;
    }

    if (fullName !== undefined) {
      const normalizedFullName = String(fullName || '').trim();
      if (!normalizedFullName) {
        return res.status(400).json({ message: 'fullName không được để trống' });
      }
      student.fullName = normalizedFullName;
    }

    if (gender !== undefined) {
      if (gender === null || gender === '') {
        student.gender = undefined;
      } else if (![0, 1].includes(Number(gender))) {
        return res.status(400).json({ message: 'gender chỉ nhận 0 hoặc 1' });
      } else {
        student.gender = Number(gender);
      }
    }

    if (password !== undefined) {
      const normalizedPassword = String(password || '');
      if (normalizedPassword.length < 6) {
        return res.status(400).json({ message: 'password tối thiểu 6 ký tự' });
      }
      student.passwordHash = await bcrypt.hash(normalizedPassword, 10);
    }

    if (schoolClassId !== undefined) {
      const schoolClassResult = await validateManagedSchoolClass(teacherContext, schoolClassId);
      if (schoolClassResult.error) {
        return res.status(schoolClassResult.error.status).json({ message: schoolClassResult.error.message });
      }

      await UserSchoolClass.deleteMany({ userId: student._id });
      await UserSchoolClass.create({
        userId: student._id,
        schoolClassId: schoolClassResult.schoolClass._id
      });
    }

    const dobResult = normalizeDateOfBirth(dateOfBirth);
    if (dobResult.error) {
      return res.status(400).json({ message: dobResult.error });
    }

    if (dobResult.hasValue) {
      student.dateOfBirth = dobResult.value;
    }
    if (address !== undefined) {
      student.address = normalizeOptionalText(address);
    }

    await student.save();

    let avatarUploadError = null;
    if (avatarFile && avatarExt) {
      try {
        const uploadResult = await uploadAvatarBufferToCloudinary({
          buffer: avatarFile.buffer,
          username: student.username,
          avatarCode: 'profile',
          ext: avatarExt
        });
        const avatarUrl = uploadResult?.secure_url || null;
        if (avatarUrl) {
          await User.updateOne({ _id: student._id }, { $set: { avatarUrl } });
          student.avatarUrl = avatarUrl;
        }
      } catch (avatarError) {
        avatarUploadError = 'Khong the upload imageFile, giu avatar hien tai';
      }
    }

    const parentInfoUpdate = {};
    if (fatherName !== undefined) {
      parentInfoUpdate.fatherName = normalizeOptionalText(fatherName);
    }
    if (fatherPhone !== undefined) {
      parentInfoUpdate.fatherPhone = normalizeOptionalText(fatherPhone);
    }
    if (motherName !== undefined) {
      parentInfoUpdate.motherName = normalizeOptionalText(motherName);
    }
    if (motherPhone !== undefined) {
      parentInfoUpdate.motherPhone = normalizeOptionalText(motherPhone);
    }

    let parentInfoDoc = await ParentInfo.findOne({ studentId: student._id });
    const hasParentInfoUpdate = Object.keys(parentInfoUpdate).length > 0;
    const hasAnyParentValue = Object.values(parentInfoUpdate).some((value) => value !== null);

    if (hasParentInfoUpdate) {
      if (parentInfoDoc) {
        Object.assign(parentInfoDoc, parentInfoUpdate);
        await parentInfoDoc.save();
      } else if (hasAnyParentValue) {
        parentInfoDoc = await ParentInfo.create({
          studentId: student._id,
          ...parentInfoUpdate
        });
      }
    }

    const studentClasses = await UserSchoolClass.find({ userId: student._id })
      .populate('schoolClassId', 'className')
      .lean();

    const classList = studentClasses
      .filter((item) => item.schoolClassId)
      .map((item) => ({
        schoolClassId: item.schoolClassId._id,
        className: item.schoolClassId.className
      }));

    return res.status(200).json({
      message: 'Cập nhật học sinh thành công',
      avatarUploadError,
      student: {
        userId: student._id,
        username: student.username,
        fullName: student.fullName,
        email: student.email,
        avatarUrl: student.avatarUrl || null,
        gender: student.gender ?? null,
        schoolId: student.schoolId,
        schoolClasses: classList,
        dateOfBirth: student.dateOfBirth || null,
        address: student.address || null,
        parentInfo: parentInfoDoc
          ? {
            parentInfoId: parentInfoDoc._id,
            fatherName: parentInfoDoc.fatherName || null,
            fatherPhone: parentInfoDoc.fatherPhone || null,
            motherName: parentInfoDoc.motherName || null,
            motherPhone: parentInfoDoc.motherPhone || null
          }
          : null
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Dữ liệu bị trùng (username)' });
    }
    next(error);
  }
};

export const resetTeacherStudentPasswordController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giáo viên chưa được gán lớp quản lý' });
    }

    const { studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'studentId không hợp lệ' });
    }

    const student = await User.findOne({
      _id: studentId,
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isStatus: { $ne: 'deleted' }
    });

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy học sinh thuộc quản lý của giáo viên' });
    }

    const hasManagedClassMapping = await UserSchoolClass.findOne({
      userId: student._id,
      schoolClassId: { $in: teacherContext.managedClassIds }
    })
      .select('_id')
      .lean();

    if (!hasManagedClassMapping) {
      return res.status(403).json({ message: 'Học sinh hiện không nằm trong lớp giáo viên đang quản lý' });
    }

    const defaultPassword = '123456';
    student.passwordHash = await bcrypt.hash(defaultPassword, 10);
    await student.save();

    return res.status(200).json({
      message: 'Reset mật khẩu học sinh thành công',
      studentId: student._id,
      defaultPassword
    });
  } catch (error) {
    next(error);
  }
};

export const removeStudentFromManagedClassController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    if (!teacherContext.managedClassIds.length) {
      return res.status(400).json({ message: 'Giáo viên chưa được gán lớp quản lý' });
    }

    const { studentId, schoolClassId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'studentId không hợp lệ' });
    }

    const classValidation = await validateManagedSchoolClass(teacherContext, schoolClassId);
    if (classValidation.error) {
      return res.status(classValidation.error.status).json({ message: classValidation.error.message });
    }

    const student = await User.findOne({
      _id: studentId,
      createdByTeacherId: teacherContext.teacher._id,
      schoolId: teacherContext.teacher.schoolId,
      roles: { $in: ['student'] },
      isGuest: { $ne: true },
      isStatus: { $ne: 'deleted' }
    }).select('_id fullName email');

    if (!student) {
      return res.status(404).json({ message: 'Không tìm thấy học sinh thuộc quản lý của giáo viên' });
    }

    const classMapping = await UserSchoolClass.findOne({
      userId: student._id,
      schoolClassId: classValidation.schoolClass._id
    })
      .select('_id')
      .lean();

    if (!classMapping) {
      return res.status(400).json({ message: 'Học sinh không thuộc lớp học này' });
    }

    await Promise.all([
      UserSchoolClass.deleteMany({ userId: student._id }),
      User.updateOne(
        { _id: student._id },
        {
          $set: {
            passwordHash: null,
            fullName: null,
            gender: null,
            classId: null,
            schoolId: null,
            createdByTeacherId: null,
            dateOfBirth: null,
            address: null,
            provider: null,
            avatar: null,
            characterId: null,
            preferredTopicId: null,
            roles: [],
            isGuest: null,
            isShowCaseView: null,
            isStatus: 'deleted',
            deletedAt: new Date()
          },
          $unset: {
            username: '',
            email: '',
            googleId: '',
            facebookId: '',
            zaloId: ''
          }
        }
      )
    ]);

    return res.status(200).json({
      message: 'Xóa học sinh thành công',
      student: {
        userId: student._id,
        fullName: student.fullName,
        email: student.email
      }
    });
  } catch (error) {
    next(error);
  }
};

export const exportStudentsByClassController = async (req, res, next) => {
  try {
    const teacherContext = await getTeacherContext(req.user?.id);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    const schoolClassId = typeof req.query.schoolClassId === 'string'
      ? req.query.schoolClassId.trim()
      : '';

    if (!schoolClassId) {
      return res.status(400).json({ message: 'schoolClassId la bat buoc' });
    }

    const classValidation = await validateManagedSchoolClass(teacherContext, schoolClassId);
    if (classValidation.error) {
      return res.status(classValidation.error.status).json({ message: classValidation.error.message });
    }

    const mappings = await UserSchoolClass.find({ schoolClassId: classValidation.schoolClass._id })
      .select('userId')
      .lean();

    const userIds = mappings.map((item) => item.userId).filter(Boolean);
    const users = userIds.length
      ? await User.find({
        _id: { $in: userIds },
        createdByTeacherId: teacherContext.teacher._id,
        schoolId: teacherContext.teacher.schoolId,
        roles: { $in: ['student'] },
        isGuest: { $ne: true },
        isStatus: { $ne: 'deleted' }
      })
        .select('userCode username fullName gender dateOfBirth address avatarUrl')
        .sort({ fullName: 1 })
        .lean()
      : [];

    const parentInfos = users.length
      ? await ParentInfo.find({ studentId: { $in: users.map((user) => user._id) } })
        .select('studentId fatherName fatherPhone motherName motherPhone')
        .lean()
      : [];
    const parentInfoMap = new Map(parentInfos.map((item) => [String(item.studentId), item]));

    const toExcelText = (value) => normalizePhoneFromExcel(value) || '';

    const rows = users.map((user) => ({
      userCode: user.userCode || '',
      username: user.username || '',
      fullName: user.fullName || '',
      gender: user.gender === 1 ? 'Nam' : user.gender === 0 ? 'Nu' : '',
      dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().slice(0, 10) : '',
      fatherName: parentInfoMap.get(String(user._id))?.fatherName || '',
      fatherPhone: toExcelText(parentInfoMap.get(String(user._id))?.fatherPhone),
      motherName: parentInfoMap.get(String(user._id))?.motherName || '',
      motherPhone: toExcelText(parentInfoMap.get(String(user._id))?.motherPhone),
      address: user.address || '',
      avatarUrl: user.avatarUrl || '',
      avatarReplaceCode: '',
      password: ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        'userCode',
        'username',
        'fullName',
        'gender',
        'dateOfBirth',
        'fatherName',
        'fatherPhone',
        'motherName',
        'motherPhone',
        'address',
        'avatarUrl',
        'avatarReplaceCode',
        'password'
      ]
    });

    const vietnameseHeaders = [
      'Mã học sinh',
      'Tên đăng nhập',
      'Họ và tên',
      'Giới tính',
      'Ngày sinh',
      'Tên bố/ người giám hộ nam',
      'SĐT bố/người giám hộ nam',
      'Tên mẹ/ người giám hộ nữ',
      'SĐT mẹ/người giám hộ nữ',
      'Địa chỉ',
      'Ảnh đại diện (link)',
      'Ảnh đại diện thay thế (mã ảnh)',
      'Mật khẩu'
    ];
    vietnameseHeaders.forEach((label, colIndex) => {
      const headerCell = XLSX.utils.encode_cell({ c: colIndex, r: 0 });
      if (!ws[headerCell]) {
        ws[headerCell] = { t: 's', v: label };
      } else {
        ws[headerCell].t = 's';
        ws[headerCell].v = label;
      }
    });

    rows.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 1;
      const fatherPhoneCell = XLSX.utils.encode_cell({ c: 6, r: excelRowIndex });
      const motherPhoneCell = XLSX.utils.encode_cell({ c: 8, r: excelRowIndex });
      const avatarReplaceCodeCell = XLSX.utils.encode_cell({ c: 11, r: excelRowIndex });
      ws[fatherPhoneCell] = { t: 's', v: row.fatherPhone || '' };
      ws[motherPhoneCell] = { t: 's', v: row.motherPhone || '' };
      ws[avatarReplaceCodeCell] = { t: 's', v: String(row.avatarReplaceCode || '') };
    });

    ws['!cols'] = [
      { wch: 14 },
      { wch: 16 },
      { wch: 24 },
      { wch: 10 },
      { wch: 14 },
      { wch: 24 },
      { wch: 16 },
      { wch: 24 },
      { wch: 16 },
      { wch: 30 },
      { wch: 45 },
      { wch: 24 },
      { wch: 14 }
    ];
    // Keep SDT + avatar code columns in Text format to preserve leading zeros on manual edits.
    enforceTextColumns(ws, [6, 8, 11], rows.length);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hoc sinh');

    const safeClassName = String(classValidation.schoolClass.className || 'class')
      .replace(/[\\/<>:"|?*]+/g, '-')
      .trim();
    const fileName = `Student_List_${safeClassName || 'class'}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const buffer = XLSX.write(wb, { type: 'buffer', cellStyles: true });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};
export const downloadStudentTemplateController = async (req, res, next) => {
  try {
    // Kiểm tra quyền giáo viên
    const teacherId = req.user?.id;
    const teacherContext = await getTeacherContext(teacherId);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    // Tạo workbook với dữ liệu mẫu
    const templateData = [
      {
        username: 'student_01',
        fullName: 'Nguyen Van A',
        gender: 'Nam',
        dateOfBirth: '2010-01-15',
        fatherName: 'Nguyen Van B',
        fatherPhone: '0901234567',
        motherName: 'Tran Thi C',
        motherPhone: '0912345678',
        address: '123 Duong ABC, Ha Noi',
        avatarCode: '001',
        password: '123456'
      },
      {
        username: 'student_02',
        fullName: 'Tran Thi B',
        gender: 'Nu',
        dateOfBirth: '2010-06-20',
        fatherName: '',
        fatherPhone: '',
        motherName: '',
        motherPhone: '',
        address: '456 Duong XYZ, Ha Noi',
        avatarCode: '',
        password: '123456'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData, {
      header: [
        'username',
        'fullName',
        'gender',
        'dateOfBirth',
        'fatherName',
        'fatherPhone',
        'motherName',
        'motherPhone',
        'address',
        'avatarCode',
        'password'
      ]
    });

    const templateVietnameseHeaders = [
      'Tên đăng nhập (Bắt buộc nhập)',
      'Họ và tên (Bắt buộc nhập)',
      'Giới tính (Nam/Nu)',
      'Ngày sinh',
      'Tên bố/ người giám hộ nam',
      'SĐT bố/ người giám hộ nam',
      'Tên mẹ/ người giám hộ nữ',
      'SĐT mẹ/ người giám hộ nữ',
      'Địa chỉ',
      'Ảnh đại diện (mã ảnh)',
      'Mật khẩu (Bắt buộc khi tạo mới)'
    ];
    templateVietnameseHeaders.forEach((label, colIndex) => {
      const headerCell = XLSX.utils.encode_cell({ c: colIndex, r: 0 });
      if (!ws[headerCell]) {
        ws[headerCell] = { t: 's', v: label };
      } else {
        ws[headerCell].t = 's';
        ws[headerCell].v = label;
      }
    });

    // Preserve leading zero in phone and avatar-code samples.
    templateData.forEach((row, rowIndex) => {
      const excelRowIndex = rowIndex + 1; // row 1 is header
      const fatherPhoneCell = XLSX.utils.encode_cell({ c: 5, r: excelRowIndex }); // F
      const motherPhoneCell = XLSX.utils.encode_cell({ c: 7, r: excelRowIndex }); // H
      const avatarCodeCell = XLSX.utils.encode_cell({ c: 9, r: excelRowIndex }); // J
      ws[fatherPhoneCell] = { t: 's', v: String(row.fatherPhone || '') };
      ws[motherPhoneCell] = { t: 's', v: String(row.motherPhone || '') };
      ws[avatarCodeCell] = { t: 's', v: String(row.avatarCode || '') };
    });

    // Đặt độ rộng cột
    ws['!cols'] = [
      { wch: 15 },
      { wch: 20 },
      { wch: 8 },
      { wch: 15 },
      { wch: 30 },
      { wch: 20 },
      { wch: 16 },
      { wch: 20 },
      { wch: 16 },
      { wch: 18 },
      { wch: 12 }
    ];
    // Keep SDT + avatar code columns in Text format to preserve leading zeros on manual edits.
    enforceTextColumns(ws, [5, 7, 9], templateData.length);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Học sinh');

    // Thêm sheet hướng dẫn
    const instructionData = [
      ['Hướng dẫn nhập liệu:'],
      [''],
      ['Cột', 'Yêu cầu', 'Ghi chú'],
      ['Tên đăng nhập (Bắt buộc nhập)', 'Bắt buộc, duy nhất', 'Không chứa ký tự đặc biệt'],
      ['Họ và tên (Bắt buộc nhập)', 'Bắt buộc', 'Tên đầy đủ của học sinh'],
      ['Giới tính (Nam/Nữ)', 'Tùy chọn', 'Nhập Nam hoặc Nữ (chấp nhận cả 1/0)'],
      ['Ngày sinh', 'Tùy chọn', 'Định dạng YYYY-MM-DD'],
      ['Địa chỉ', 'Tùy chọn', 'Địa chỉ của học sinh'],
      ['Ảnh đại diện (mã ảnh)', 'Tùy chọn', 'Nhập mã ảnh (ví dụ 001), upload kèm file ZIP chứa ảnh 001.jpg/png'],
      ['Mật khẩu (Bắt buộc khi tạo mới)', 'Bắt buộc khi tạo mới', 'Tối thiểu 6 ký tự']
    ];

    instructionData.splice(
      instructionData.length - 1,
      0,
      ['Tên bố/người giám hộ nam', 'Tùy chọn', 'Tên bố/người giám hộ nam'],
      ['SĐT bố/người giám hộ nam', 'Tùy chọn', 'Số điện thoại bố/người giám hộ nam'],
      ['Tên mẹ/người giám hộ nữ', 'Tùy chọn', 'Tên mẹ/người giám hộ nữ'],
      ['SĐT mẹ/người giám hộ nữ', 'Tùy chọn', 'Số điện thoại mẹ/người giám hộ nữ']
    );

    const wsInstruction = XLSX.utils.aoa_to_sheet(instructionData);
    wsInstruction['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsInstruction, 'Hướng dẫn');

    // Gửi file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Student_Template.xlsx"');

    const buffer = XLSX.write(wb, { type: 'buffer', cellStyles: true });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

export const uploadBulkStudentsController = async (req, res, next) => {
  try {
    const requestStartedAt = Date.now();
    const perf = {};
    let stageStartedAt = Date.now();
    const markStage = (name) => {
      perf[name] = Date.now() - stageStartedAt;
      stageStartedAt = Date.now();
    };
    const showPerformanceMs = String(req.query?.showPerformanceMs || '').toLowerCase() === '1';

    const excelFile = req.files?.file?.[0] || req.file || null;
    const avatarZipFile = req.files?.avatarZip?.[0] || null;
    const maxImportRows = Math.max(
      100,
      Number.parseInt(process.env.BULK_IMPORT_MAX_ROWS || '2000', 10) || 2000
    );
    const sheetRowsLimit = maxImportRows + 1; // +1 for header row

    if (!excelFile) {
      return res.status(400).json({ message: 'Vui long chon file Excel de upload' });
    }

    const teacherId = req.user?.id;
    const teacherContext = await getTeacherContext(teacherId);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    const { schoolClassId } = req.params;
    let targetSchoolClassId = null;
    if (schoolClassId) {
      const classValidation = await validateManagedSchoolClass(teacherContext, schoolClassId);
      if (classValidation.error) {
        return res.status(classValidation.error.status).json({ message: classValidation.error.message });
      }
      targetSchoolClassId = classValidation.schoolClass._id;
    }

    let workbook;
    try {
      if (excelFile?.path) {
        workbook = XLSX.readFile(excelFile.path, {
          dense: true,
          cellStyles: false,
          cellHTML: false,
          cellNF: false,
          sheetRows: sheetRowsLimit
        });
      } else if (excelFile?.buffer) {
        workbook = XLSX.read(excelFile.buffer, {
          type: 'buffer',
          dense: true,
          cellStyles: false,
          cellHTML: false,
          cellNF: false,
          sheetRows: sheetRowsLimit
        });
      } else {
        return res.status(400).json({ message: 'File Excel khong hop le' });
      }
    } catch (err) {
      return res.status(400).json({ message: 'File Excel khong hop le' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      return res.status(400).json({ message: 'File Excel khong co du lieu' });
    }
    markStage('readWorkbookMs');

    let avatarBufferMap = new Map();

    const normalizeHeaderKey = (key) => {
      const normalized = String(key || '')
        .trim()
        .toLowerCase()
        .replace(/[\u0111]/g, 'd')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

      if (!normalized) return '';
      if (normalized.startsWith('usercode') || normalized.startsWith('mahocsinh')) return 'userCode';
      if (normalized.startsWith('username') || normalized.startsWith('tendangnhap')) return 'username';
      if (normalized.startsWith('fullname') || normalized.startsWith('hovaten')) return 'fullName';
      if (normalized.startsWith('gender') || normalized.startsWith('gioitinh')) return 'gender';
      if (normalized.startsWith('dateofbirth') || normalized.startsWith('ngaysinh')) return 'dateOfBirth';
      if (normalized.startsWith('address') || normalized.startsWith('diachi')) return 'address';
      if (normalized.startsWith('fathername') || normalized.startsWith('tenbonguoigiamhonam')) return 'fatherName';
      if (
        normalized.startsWith('fatherphone') ||
        normalized.startsWith('sdtbonguoigiamhonam') ||
        normalized.startsWith('sodienthoaibonguoigiamhonam')
      ) {
        return 'fatherPhone';
      }
      if (normalized.startsWith('mothername') || normalized.startsWith('tenmenguoigiamhonu')) return 'motherName';
      if (
        normalized.startsWith('motherphone') ||
        normalized.startsWith('sdtmenguoigiamhonu') ||
        normalized.startsWith('sodienthoaimenguoigiamhonu')
      ) {
        return 'motherPhone';
      }
      if (normalized.startsWith('avatarurl') || normalized.startsWith('anhdaidienlink')) return 'avatarUrl';
      if (
        normalized.startsWith('avatarreplacecode') ||
        normalized.startsWith('avatarcode') ||
        normalized.startsWith('anhdaidienthaythe') ||
        normalized.startsWith('anhdaidienma') ||
        normalized.startsWith('maanh') ||
        normalized.startsWith('anhdaidien')
      ) {
        return 'avatarReplaceCode';
      }
      if (normalized.startsWith('password') || normalized.startsWith('matkhau')) return 'password';
      return '';
    };

    const matrixRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false
    });

    if (!Array.isArray(matrixRows) || matrixRows.length === 0) {
      return res.status(400).json({ message: 'File khong chua du lieu hoc sinh' });
    }

    const headerRow = Array.isArray(matrixRows[0]) ? matrixRows[0] : [];
    const mappedColumns = headerRow
      .map((headerValue, colIndex) => ({
        colIndex,
        mappedKey: normalizeHeaderKey(headerValue)
      }))
      .filter((item) => item.mappedKey);

    const rows = [];
    for (let r = 1; r < matrixRows.length; r++) {
      const currentRow = Array.isArray(matrixRows[r]) ? matrixRows[r] : [];
      const normalizedRow = {};
      let hasMeaningfulValue = false;

      for (const col of mappedColumns) {
        const value = currentRow[col.colIndex];
        normalizedRow[col.mappedKey] = value;

        if (!hasMeaningfulValue) {
          if (value !== null && value !== undefined) {
            if (typeof value === 'string') {
              if (value.trim() !== '') hasMeaningfulValue = true;
            } else {
              hasMeaningfulValue = true;
            }
          }
        }
      }

      if (hasMeaningfulValue) {
        rows.push(normalizedRow);
      }
    }

    if (!rows || rows.length === 0) {
      return res.status(400).json({ message: 'File khong chua du lieu hoc sinh' });
    }
    markStage('parseRowsMs');

    const results = {
      total: rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      avatarUploaded: 0,
      avatarMissing: 0,
      avatarCleared: 0,
      errors: [],
      details: []
    };

    const normalizedRows = [];
    const seenCodes = new Set();
    const seenUsernames = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;

      try {
        const userCode = String(row.userCode || '').trim();
        const username = String(row.username || '').trim();
        const fullName = String(row.fullName || '').trim();
        const password = String(row.password || '').trim();

        if (userCode) {
          const codeKey = userCode.toLowerCase();
          if (seenCodes.has(codeKey)) {
            results.errors.push({ row: rowIndex, message: `Ma hoc sinh '${userCode}' bi trung trong file` });
            continue;
          }
          seenCodes.add(codeKey);
        }

        if (!userCode && !username) {
          results.errors.push({ row: rowIndex, message: 'Thieu username hoac ma hoc sinh' });
          continue;
        }

        if (username) {
          const unameKey = username.toLowerCase();
          if (seenUsernames.has(unameKey)) {
            results.errors.push({ row: rowIndex, message: `username '${username}' bi trung trong file` });
            continue;
          }
          seenUsernames.add(unameKey);
        }

        const genderResult = parseGenderValue(row.gender);
        if (genderResult.error) {
          results.errors.push({ row: rowIndex, message: genderResult.error });
          continue;
        }

        const dobResult = normalizeDateOfBirth(row.dateOfBirth || undefined);
        if (dobResult.error) {
          results.errors.push({ row: rowIndex, message: dobResult.error });
          continue;
        }

        normalizedRows.push({
          rowIndex,
          userCode: userCode || null,
          username: username || null,
          fullName: fullName || null,
          password: password || null,
          gender: genderResult.hasValue ? genderResult.value : undefined,
          hasGenderValue: genderResult.hasValue,
          dobValue: dobResult.value,
          hasDobValue: dobResult.hasValue,
          address: normalizeOptionalText(row.address),
          fatherName: normalizeOptionalText(row.fatherName),
          fatherPhone: normalizePhoneFromExcel(row.fatherPhone),
          motherName: normalizeOptionalText(row.motherName),
          motherPhone: normalizePhoneFromExcel(row.motherPhone),
          avatarReplaceCode: normalizeAvatarCode(row.avatarReplaceCode)
        });
      } catch (rowError) {
        results.errors.push({
          row: rowIndex,
          message: rowError.message || 'Loi xu ly dong du lieu'
        });
      }
    }

    if (!normalizedRows.length) {
      const responsePayload = {
        message: 'Import hoan tat',
        ...results
      };
      if (showPerformanceMs) {
        responsePayload.performanceMs = {
          ...perf,
          normalizeRowsMs: Date.now() - stageStartedAt,
          totalMs: Date.now() - requestStartedAt
        };
      }
      return res.status(200).json(responsePayload);
    }
    markStage('normalizeRowsMs');

    const neededAvatarCodes = new Set(normalizedRows.map((item) => item.avatarReplaceCode).filter(Boolean));
    if (avatarZipFile && neededAvatarCodes.size > 0) {
      try {
        let zipBuffer = avatarZipFile.buffer;
        if (!zipBuffer && avatarZipFile.path) {
          zipBuffer = fs.readFileSync(avatarZipFile.path);
        }
        if (!zipBuffer) {
          return res.status(400).json({ message: 'File archive avatar khong hop le' });
        }
        avatarBufferMap = await buildAvatarBufferMapFromArchive({
          archiveBuffer: zipBuffer,
          fileName: avatarZipFile.originalname,
          mimeType: avatarZipFile.mimetype,
          wantedCodes: neededAvatarCodes
        });
      } catch (zipError) {
        return res.status(400).json({ message: 'Khong the doc file avatar (.zip/.rar)' });
      }
    }
    markStage('readAvatarArchiveMs');

    const incomingCodes = Array.from(new Set(normalizedRows.map((r) => r.userCode).filter(Boolean)));
    const incomingUsernames = Array.from(new Set(normalizedRows.map((r) => r.username).filter(Boolean)));

    const managedUsersQuery = {
      schoolId: teacherContext.teacher.schoolId,
      createdByTeacherId: teacherContext.teacher._id,
      roles: { $in: ['student'] },
      isGuest: { $ne: true },
      isStatus: { $ne: 'deleted' }
    };

    const orConditions = [];
    if (incomingCodes.length) orConditions.push({ userCode: { $in: incomingCodes } });
    if (incomingUsernames.length) orConditions.push({ username: { $in: incomingUsernames } });

    const managedExistingUsers = orConditions.length
      ? await User.find({ ...managedUsersQuery, $or: orConditions })
        .select('_id userCode username fullName gender dateOfBirth address avatarUrl')
        .lean()
      : [];

    const managedByCode = new Map(
      managedExistingUsers
        .filter((u) => u.userCode)
        .map((u) => [String(u.userCode).toLowerCase(), u])
    );
    const managedByUsername = new Map(
      managedExistingUsers
        .filter((u) => u.username)
        .map((u) => [String(u.username).toLowerCase(), u])
    );

    const allCandidateUsernames = Array.from(new Set(normalizedRows.map((r) => r.username).filter(Boolean)));
    const usersWithSameUsernames = allCandidateUsernames.length
      ? await User.find({ username: { $in: allCandidateUsernames } })
        .select('_id username')
        .lean()
      : [];
    const usernameOwnerMap = new Map(
      usersWithSameUsernames
        .filter((u) => u.username)
        .map((u) => [String(u.username).toLowerCase(), String(u._id)])
    );

    const managedUserIds = managedExistingUsers.map((user) => user._id);
    const existingMappings = managedUserIds.length
      ? await UserSchoolClass.find({ userId: { $in: managedUserIds } })
        .select('userId schoolClassId')
        .lean()
      : [];
    const existingParentInfos = managedUserIds.length
      ? await ParentInfo.find({ studentId: { $in: managedUserIds } })
        .select('studentId fatherName fatherPhone motherName motherPhone')
        .lean()
      : [];

    const mappingMap = new Map();
    for (const mapping of existingMappings) {
      const userIdStr = String(mapping.userId);
      if (!mappingMap.has(userIdStr)) mappingMap.set(userIdStr, []);
      mappingMap.get(userIdStr).push(String(mapping.schoolClassId));
    }
    const parentInfoMap = new Map(existingParentInfos.map((item) => [String(item.studentId), item]));
    markStage('loadExistingDataMs');

    const createDocs = [];
    const createMeta = [];
    const updateOps = [];
    const parentInfoOps = [];
    const createParentInfoDocs = [];
    const updatedUserIds = [];
    const avatarAssignments = [];
    const passwordHashCache = new Map();
    const getPasswordHash = async (plainPassword) => {
      if (!passwordHashCache.has(plainPassword)) {
        passwordHashCache.set(plainPassword, bcrypt.hash(plainPassword, 10));
      }
      return passwordHashCache.get(plainPassword);
    };

    for (const item of normalizedRows) {
      const codeKey = item.userCode ? item.userCode.toLowerCase() : null;
      const usernameKey = item.username ? item.username.toLowerCase() : null;

      let student = null;
      if (codeKey) {
        student = managedByCode.get(codeKey) || null;
        if (!student) {
          results.errors.push({
            row: item.rowIndex,
            message: `Khong tim thay hoc sinh voi ma '${item.userCode}'`
          });
          continue;
        }
      } else if (usernameKey && managedByUsername.has(usernameKey)) {
        student = managedByUsername.get(usernameKey);
      }

      if (!student) {
        if (!item.username) {
          results.errors.push({
            row: item.rowIndex,
            message: 'Tao moi bat buoc co username'
          });
          continue;
        }
        if (!item.fullName) {
          results.errors.push({
            row: item.rowIndex,
            message: 'Tao moi bat buoc co fullName'
          });
          continue;
        }
        if (!item.password || item.password.length < 6) {
          results.errors.push({
            row: item.rowIndex,
            message: 'Mat khau la bat buoc khi tao moi va phai toi thieu 6 ky tu'
          });
          continue;
        }

        const usernameOwner = usernameOwnerMap.get(item.username.toLowerCase());
        if (usernameOwner) {
          results.errors.push({
            row: item.rowIndex,
            message: `username '${item.username}' da ton tai`
          });
          continue;
        }
        // Reserve username in this batch to avoid late conflicts.
        usernameOwnerMap.set(item.username.toLowerCase(), `new:${item.rowIndex}`);

        createDocs.push({
          username: item.username,
          passwordHash: await getPasswordHash(item.password),
          fullName: item.fullName,
          gender: item.hasGenderValue ? item.gender : undefined,
          dateOfBirth: item.hasDobValue ? item.dobValue : null,
          address: item.address,
          avatarUrl: null,
          roles: ['student'],
          schoolId: teacherContext.teacher.schoolId,
          createdByTeacherId: teacherId,
          isGuest: false
        });
        createMeta.push(item);
        continue;
      }

      const updates = {};

      if (item.username && item.username !== student.username) {
        const nextUsernameKey = item.username.toLowerCase();
        const currentUsernameKey = student.username ? student.username.toLowerCase() : null;
        const ownerUserId = usernameOwnerMap.get(nextUsernameKey);

        if (ownerUserId && ownerUserId !== String(student._id)) {
          results.errors.push({
            row: item.rowIndex,
            message: `username '${item.username}' da ton tai`
          });
          continue;
        }

        // Move ownership in memory so later rows validate against updated state.
        if (currentUsernameKey && usernameOwnerMap.get(currentUsernameKey) === String(student._id)) {
          usernameOwnerMap.delete(currentUsernameKey);
        }
        usernameOwnerMap.set(nextUsernameKey, String(student._id));
        updates.username = item.username;
      }

      if (item.fullName && item.fullName !== student.fullName) {
        updates.fullName = item.fullName;
      }
      if (item.hasGenderValue && item.gender !== student.gender) {
        updates.gender = item.gender;
      }
      if (item.hasDobValue && item.dobValue?.toString() !== student.dateOfBirth?.toString()) {
        updates.dateOfBirth = item.dobValue;
      }
      if (item.address !== student.address) {
        updates.address = item.address;
      }

      if (item.password) {
        if (item.password.length < 6) {
          results.errors.push({
            row: item.rowIndex,
            message: 'Mat khau phai toi thieu 6 ky tu'
          });
          continue;
        }
        updates.passwordHash = await getPasswordHash(item.password);
      }

      const currentParentInfo = parentInfoMap.get(String(student._id)) || null;
      const parentUpdates = {};
      if (item.fatherName !== (currentParentInfo?.fatherName ?? null)) parentUpdates.fatherName = item.fatherName;
      if (item.fatherPhone !== (currentParentInfo?.fatherPhone ?? null)) parentUpdates.fatherPhone = item.fatherPhone;
      if (item.motherName !== (currentParentInfo?.motherName ?? null)) parentUpdates.motherName = item.motherName;
      if (item.motherPhone !== (currentParentInfo?.motherPhone ?? null)) parentUpdates.motherPhone = item.motherPhone;

      const currentClassIds = mappingMap.get(String(student._id)) || [];
      const classChanged = targetSchoolClassId
        ? !(currentClassIds.length === 1 && currentClassIds[0] === String(targetSchoolClassId))
        : false;

      const hasFieldChanges = Object.keys(updates).length > 0;
      const hasParentChanges = Object.keys(parentUpdates).length > 0;
      const hasAnyParentValue = [item.fatherName, item.fatherPhone, item.motherName, item.motherPhone]
        .some((value) => value !== null);

      if (!hasFieldChanges && !classChanged && !hasParentChanges) {
        results.skipped += 1;
        results.details.push({
          row: item.rowIndex,
          userCode: student.userCode || null,
          username: student.username,
          action: 'skipped',
          studentId: student._id,
          reason: 'Khong co thay doi'
        });
      } else {
        if (hasFieldChanges) {
          updateOps.push({
            updateOne: {
              filter: { _id: student._id },
              update: { $set: updates }
            }
          });
        }

        if (hasParentChanges && (currentParentInfo || hasAnyParentValue)) {
          parentInfoOps.push({
            updateOne: {
              filter: { studentId: student._id },
              update: {
                $set: parentUpdates,
                ...(currentParentInfo ? {} : { $setOnInsert: { studentId: student._id } })
              },
              ...(currentParentInfo ? {} : { upsert: true })
            }
          });
        }

        results.updated += 1;
        updatedUserIds.push(student._id);
        results.details.push({
          row: item.rowIndex,
          userCode: student.userCode || null,
          username: item.username || student.username,
          action: 'updated',
          studentId: student._id,
          updates: [
            ...Object.keys(updates),
            ...Object.keys(parentUpdates),
            ...(classChanged ? ['schoolClassId'] : [])
          ]
        });
      }

      avatarAssignments.push({
        rowIndex: item.rowIndex,
        username: item.username || student.username,
        userId: student._id,
        oldAvatarUrl: student.avatarUrl || null,
        avatarReplaceCode: item.avatarReplaceCode
      });
    }

    if (createDocs.length) {
      // insertMany does not trigger pre('save'), so we generate student userCode explicitly.
      const generatedUserCodes = await generateStudentUserCodesForBulkInsert(createDocs.length);
      createDocs.forEach((doc, index) => {
        doc.userCode = generatedUserCodes[index] || null;
      });

      const createdUsers = await User.insertMany(createDocs, { ordered: false });
      const createdUserMap = new Map(createdUsers.map((user) => [user.username, user]));

      for (const item of createMeta) {
        const createdUser = createdUserMap.get(item.username);
        if (!createdUser) continue;

        if ([item.fatherName, item.fatherPhone, item.motherName, item.motherPhone].some((value) => value !== null)) {
          createParentInfoDocs.push({
            studentId: createdUser._id,
            fatherName: item.fatherName,
            fatherPhone: item.fatherPhone,
            motherName: item.motherName,
            motherPhone: item.motherPhone
          });
        }

        results.created += 1;
        results.details.push({
          row: item.rowIndex,
          userCode: createdUser.userCode || null,
          username: createdUser.username,
          action: 'created',
          studentId: createdUser._id
        });

        avatarAssignments.push({
          rowIndex: item.rowIndex,
          username: createdUser.username,
          userId: createdUser._id,
          oldAvatarUrl: null,
          avatarReplaceCode: item.avatarReplaceCode
        });

        updatedUserIds.push(createdUser._id);
      }
    }

    if (updateOps.length) {
      await User.bulkWrite(updateOps, { ordered: false });
    }

    if (createParentInfoDocs.length) {
      await ParentInfo.insertMany(createParentInfoDocs, { ordered: false });
    }

    if (parentInfoOps.length) {
      await ParentInfo.bulkWrite(parentInfoOps, { ordered: false });
    }
    markStage('writeUsersAndParentsMs');

    if (targetSchoolClassId && updatedUserIds.length) {
      const affectedUserIds = Array.from(new Set(updatedUserIds.map((id) => String(id))));
      await UserSchoolClass.deleteMany({ userId: { $in: affectedUserIds } });
      await UserSchoolClass.insertMany(
        affectedUserIds.map((userId) => ({
          userId,
          schoolClassId: targetSchoolClassId
        })),
        { ordered: false }
      );
    }
    markStage('writeClassMappingsMs');

    const avatarUploadConcurrency = Math.max(
      1,
      Number.parseInt(process.env.BULK_AVATAR_UPLOAD_CONCURRENCY || '4', 10) || 4
    );
    const avatarAssignmentsWithCode = avatarAssignments.filter((assignment) => assignment.avatarReplaceCode);
    const asyncAvatarQuery = String(req.query?.asyncAvatar ?? '1').toLowerCase();
    const shouldProcessAvatarAsync = (
      asyncAvatarQuery !== '0'
      && asyncAvatarQuery !== 'false'
      && avatarAssignmentsWithCode.length > 0
      && avatarBufferMap.size > 0
    );

    let avatarJobPayload = null;
    if (shouldProcessAvatarAsync) {
      const uniqueAvatarCodes = new Set(
        avatarAssignmentsWithCode.map((assignment) => assignment.avatarReplaceCode).filter(Boolean)
      );
      const avatarJob = await createBulkAvatarJob({
        teacherId,
        schoolClassId: targetSchoolClassId,
        totalAssignments: avatarAssignmentsWithCode.length,
        totalCodes: uniqueAvatarCodes.size
      });

      const serializedAvatarJob = serializeBulkAvatarJob(avatarJob);
      avatarJobPayload = {
        ...serializedAvatarJob,
        statusEndpoint: `/users/teacher/students/bulk/upload/jobs/${serializedAvatarJob.jobId}`
      };
      emitBulkAvatarJobRealtime(String(teacherContext.teacher._id), avatarJobPayload);

      // Fire-and-forget background avatar processing so import can return immediately.
      runBulkAvatarJobInBackground({
        job: avatarJob,
        avatarAssignments,
        avatarBufferMap,
        avatarUploadConcurrency
      }).catch((jobError) => {
        console.error('[Bulk Avatar Job] Unhandled background error:', jobError);
      });
      markStage('avatarProcessingMs');
    } else {
      const avatarResult = await processAvatarAssignments({
        avatarAssignments,
        avatarBufferMap,
        avatarUploadConcurrency
      });
      results.avatarUploaded = avatarResult.avatarUploaded;
      results.avatarMissing = avatarResult.avatarMissing;
      results.avatarCleared = avatarResult.avatarCleared;
      if (avatarResult.errors?.length) {
        results.errors.push(...avatarResult.errors);
      }
      markStage('avatarProcessingMs');
    }

    if (excelFile?.path) {
      fs.unlink(excelFile.path, (err) => {
        if (err) console.error('Loi xoa file:', err);
      });
    }
    if (avatarZipFile?.path) {
      fs.unlink(avatarZipFile.path, (err) => {
        if (err) console.error('Loi xoa file:', err);
      });
    }

    const responsePayload = {
      message: 'Import hoan tat',
      ...results,
      avatarDeferred: Boolean(avatarJobPayload),
      avatarJob: avatarJobPayload
    };
    if (showPerformanceMs) {
      responsePayload.performanceMs = {
        ...perf,
        cleanupMs: Date.now() - stageStartedAt,
        totalMs: Date.now() - requestStartedAt
      };
    }
    return res.status(200).json(responsePayload);
  } catch (error) {
    const excelFile = req.files?.file?.[0] || req.file || null;
    const avatarZipFile = req.files?.avatarZip?.[0] || null;
    if (excelFile?.path) {
      fs.unlink(excelFile.path, (err) => {
        if (err) console.error('Loi xoa file:', err);
      });
    }
    if (avatarZipFile?.path) {
      fs.unlink(avatarZipFile.path, (err) => {
        if (err) console.error('Loi xoa file:', err);
      });
    }
    next(error);
  }
};

export const getBulkUploadAvatarJobStatusController = async (req, res, next) => {
  try {
    const teacherId = req.user?.id;
    const teacherContext = await getTeacherContext(teacherId);
    if (teacherContext.error) {
      return res.status(teacherContext.error.status).json({ message: teacherContext.error.message });
    }

    const { jobId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(404).json({ message: 'Khong tim thay avatar upload job' });
    }

    const job = await BulkAvatarUploadJob.findOne({
      _id: jobId,
      teacherId: teacherContext.teacher._id
    }).lean();
    if (!job) {
      return res.status(404).json({ message: 'Khong tim thay avatar upload job' });
    }

    return res.status(200).json({
      message: 'Lay trang thai avatar job thanh cong',
      job: serializeBulkAvatarJob(job)
    });
  } catch (error) {
    next(error);
  }
};
export default {
  getStudentsController,
  createStudentByTeacherController,
  getTeacherManagedStudentsController,
  updateTeacherManagedStudentController,
  resetTeacherStudentPasswordController,
  downloadStudentTemplateController,
  uploadBulkStudentsController,
  getBulkUploadAvatarJobStatusController
};




