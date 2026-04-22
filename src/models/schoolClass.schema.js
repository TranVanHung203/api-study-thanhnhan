import mongoose from 'mongoose';

const SchoolClassSchema = new mongoose.Schema({
  className: {
    type: String,
    required: true,
    trim: true,
    unique: true
  }
});

const SchoolClass = mongoose.model('SchoolClass', SchoolClassSchema);

export default SchoolClass;
