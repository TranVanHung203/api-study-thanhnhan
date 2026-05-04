import mongoose from 'mongoose';

const SchoolClassSchema = new mongoose.Schema({
  className: {
    type: String,
    required: true,
    trim: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  }
}, { timestamps: true });

SchoolClassSchema.index({ schoolId: 1, className: 1 });

const SchoolClass = mongoose.model('SchoolClass', SchoolClassSchema);

export default SchoolClass;
