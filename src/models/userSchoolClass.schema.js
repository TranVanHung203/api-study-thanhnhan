import mongoose from 'mongoose';

const UserSchoolClassSchema = new mongoose.Schema({
  userId: {
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

UserSchoolClassSchema.index({ userId: 1, schoolClassId: 1 }, { unique: true });
UserSchoolClassSchema.index({ userId: 1 });
UserSchoolClassSchema.index({ schoolClassId: 1 });

const UserSchoolClass = mongoose.model('UserSchoolClass', UserSchoolClassSchema);

export default UserSchoolClass;
