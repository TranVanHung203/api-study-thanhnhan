import mongoose from 'mongoose';

const TeacherSchoolClassSchema = new mongoose.Schema({
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  schoolClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    required: true
  }
}, { timestamps: true });

TeacherSchoolClassSchema.index({ teacherId: 1, schoolClassId: 1 }, { unique: true });
TeacherSchoolClassSchema.index({ teacherId: 1 });
TeacherSchoolClassSchema.index({ schoolClassId: 1 });

const TeacherSchoolClass = mongoose.model('TeacherSchoolClass', TeacherSchoolClassSchema);

export default TeacherSchoolClass;
