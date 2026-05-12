import mongoose from 'mongoose';

const UserCharacterPurchaseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Character',
    required: true
  },
  purchasedAt: {
    type: Date,
    default: Date.now
  }
});

UserCharacterPurchaseSchema.index({ userId: 1, characterId: 1 }, { unique: true });
UserCharacterPurchaseSchema.index({ userId: 1, purchasedAt: -1 });

export default mongoose.model('UserCharacterPurchase', UserCharacterPurchaseSchema);
