import Character from '../models/character.schema.js';
import User from '../models/user.schema.js';
import Reward from '../models/reward.schema.js';
import UserCharacterPurchase from '../models/userCharacterPurchase.schema.js';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import ForbiddenError from '../errors/forbiddenError.js';

const normalizeRewardPoints = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
};

// Tạo nhân vật mới
export const createCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, url, rewardPoints, staticImageUrl } = req.body;

    if (!name || !url) {
      throw new BadRequestError('name và url là bắt buộc');
    }

    const parsedRewardPoints = normalizeRewardPoints(rewardPoints, 0);
    if (parsedRewardPoints === null) {
      throw new BadRequestError('rewardPoints phải là số nguyên >= 0');
    }

    const character = new Character({
      name: String(name).trim(),
      url: String(url).trim(),
      staticImageUrl: staticImageUrl || null,
      rewardPoints: parsedRewardPoints,
      createdBy: userId
    });
    await character.save();

    return res.status(201).json({ message: 'Tạo character thành công', character });
  } catch (error) {
    next(error);
  }
};

// Cập nhật nhân vật (chỉ chủ sở hữu mới có thể sửa)
export const updateCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, url, rewardPoints, staticImageUrl } = req.body;

    const character = await Character.findById(id);
    if (!character) throw new NotFoundError('Không tìm thấy character');

    if (String(character.createdBy) !== String(userId)) {
      throw new ForbiddenError('Không có quyền sửa character này');
    }

    if (name) character.name = String(name).trim();
    if (url) character.url = String(url).trim();
    if (staticImageUrl !== undefined) character.staticImageUrl = staticImageUrl || null;
    if (rewardPoints !== undefined) {
      const parsedRewardPoints = normalizeRewardPoints(rewardPoints);
      if (parsedRewardPoints === null) {
        throw new BadRequestError('rewardPoints phải là số nguyên >= 0');
      }
      character.rewardPoints = parsedRewardPoints;
    }

    await character.save();

    return res.status(200).json({ message: 'Cập nhật character thành công', character });
  } catch (error) {
    next(error);
  }
};

// Xóa nhân vật (chỉ chủ sở hữu mới có thể xóa)
export const deleteCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const character = await Character.findById(id);
    if (!character) throw new NotFoundError('Không tìm thấy character');

    if (String(character.createdBy) !== String(userId)) {
      throw new ForbiddenError('Không có quyền xóa character này');
    }

    await Character.deleteOne({ _id: id });
    await User.updateMany({ characterId: character._id }, { $set: { characterId: null } });
    await UserCharacterPurchase.deleteMany({ characterId: character._id });

    return res.status(200).json({ message: 'Xóa character thành công' });
  } catch (error) {
    next(error);
  }
};

// Danh sách character miễn phí (rewardPoints = 0)
export const listCharactersController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [characters, user] = await Promise.all([
      Character.find({ rewardPoints: 0 }).sort({ createdAt: -1 }),
      User.findById(userId).select('characterId')
    ]);

    const selectedCharacterId = user?.characterId ? String(user.characterId) : null;

    const enrichedCharacters = characters.map((character) => {
      const id = String(character._id);
      return {
        ...character.toObject(),
        isPurchased: true,
        purchaseStatus: 'purchased',
        isSelected: selectedCharacterId === id
      };
    });

    return res.status(200).json({ characters: enrichedCharacters });
  } catch (error) {
    next(error);
  }
};

// Danh sách cửa hàng: tất cả character và trạng thái đã mua của người dùng hiện tại
// Character có rewardPoints = 0 luôn được đánh dấu là đã mua
export const listCharacterStoreController = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [characters, purchasedRows, user] = await Promise.all([
      Character.find({}).sort({ createdAt: -1 }),
      UserCharacterPurchase.find({ userId }).select('characterId'),
      User.findById(userId).select('characterId')
    ]);

    const purchasedSet = new Set(purchasedRows.map((row) => String(row.characterId)));
    const selectedCharacterId = user?.characterId ? String(user.characterId) : null;

    const enrichedCharacters = characters.map((character) => {
      const id = String(character._id);
      const isFreeCharacter = Number(character.rewardPoints || 0) === 0;
      const isPurchased = isFreeCharacter || purchasedSet.has(id);

      return {
        ...character.toObject(),
        isPurchased,
        isSelected: selectedCharacterId === id
      };
    });

    return res.status(200).json({ characters: enrichedCharacters });
  } catch (error) {
    next(error);
  }
};

// Lấy một character theo id
export const getCharacterByIdController = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) throw new BadRequestError('id là bắt buộc');

    const character = await Character.findById(id);
    if (!character) throw new NotFoundError('Không tìm thấy character');

    return res.status(200).json({ character });
  } catch (error) {
    next(error);
  }
};

// Mua character, trừ điểm thưởng và tự động chọn cho người dùng
export const buyCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const characterId = req.params.characterId || req.body.characterId;

    if (!characterId) throw new BadRequestError('characterId là bắt buộc');

    const character = await Character.findById(characterId);
    if (!character) throw new NotFoundError('Không tìm thấy character');

    const existingPurchase = await UserCharacterPurchase.findOne({ userId, characterId });
    if (existingPurchase) {
      throw new BadRequestError('Character này bạn đã mua rồi');
    }

    const cost = Number(character.rewardPoints || 0);
    let rewardAfterPurchase = null;
    let deducted = false;

    if (cost > 0) {
      rewardAfterPurchase = await Reward.findOneAndUpdate(
        { userId, totalPoints: { $gte: cost } },
        { $inc: { totalPoints: -cost }, $set: { updatedAt: new Date() } },
        { new: true }
      );

      if (!rewardAfterPurchase) {
        throw new BadRequestError('Không đủ điểm để mua character này');
      }

      deducted = true;
    } else {
      rewardAfterPurchase = await Reward.findOne({ userId });
    }

    let purchase;
    try {
      purchase = await UserCharacterPurchase.create({ userId, characterId });
    } catch (error) {
      if (deducted) {
        await Reward.updateOne(
          { userId },
          { $inc: { totalPoints: cost }, $set: { updatedAt: new Date() } }
        );
      }
      throw error;
    }

    await User.findByIdAndUpdate(userId, { $set: { characterId } });

    return res.status(200).json({
      message: 'Mua character thành công',
      characterId,
      rewardPointsSpent: cost,
      rewardPointsRemaining: Number(rewardAfterPurchase?.totalPoints || 0)
    });
  } catch (error) {
    next(error);
  }
};

// Chọn character cho người dùng hiện tại (phải mua trước)
export const selectCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const characterId = req.params.characterId || req.body.characterId;

    if (!characterId) throw new BadRequestError('characterId là bắt buộc');

    const character = await Character.findById(characterId);
    if (!character) throw new NotFoundError('Không tìm thấy character');

    const isFreeCharacter = Number(character.rewardPoints || 0) === 0;
    const purchase = await UserCharacterPurchase.findOne({ userId, characterId });
    if (!isFreeCharacter && !purchase) {
      throw new ForbiddenError('Bạn chưa mua character này nên không thể chọn');
    }

    await User.findByIdAndUpdate(userId, { $set: { characterId } });

    return res.status(200).json({
      message: 'Đã chọn character thành công',
      characterId
    });
  } catch (error) {
    next(error);
  }
};

// Tương thích ngược: endpoint attach cũ giờ theo quy tắc "select"
export const attachCharacterToUserController = async (req, res, next) => {
  return selectCharacterController(req, res, next);
};

// Gỡ character đã chọn khỏi người dùng hiện tại
export const detachCharacterFromUserController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { characterId } = req.body;

    if (!characterId) throw new BadRequestError('characterId là bắt buộc');

    await User.updateOne(
      { _id: userId, characterId: characterId },
      { $set: { characterId: null } }
    );

    return res.status(200).json({ message: 'Đã xóa character khỏi user', characterId });
  } catch (error) {
    next(error);
  }
};
