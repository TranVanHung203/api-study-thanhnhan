import Character from '../models/character.schema.js';
import User from '../models/user.schema.js';
import BadRequestError from '../errors/badRequestError.js';
import NotFoundError from '../errors/notFoundError.js';
import ForbiddenError from '../errors/forbiddenError.js';

// Create a new character (admin or user can create their own)
export const createCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, url } = req.body;

    if (!name || !url) {
      throw new BadRequestError('name và url là bắt buộc');
    }

    const character = new Character({ name: name.trim(), url: url.trim(), createdBy: userId });
    await character.save();

    return res.status(201).json({ message: 'Tạo character thành công', character });
  } catch (error) {
    next(error);
  }
};

// Update character (only owner can update)
export const updateCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, url } = req.body;

    const character = await Character.findById(id);
    if (!character) throw new NotFoundError('Character không tìm thấy');

    if (String(character.createdBy) !== String(userId)) {
      throw new ForbiddenError('Không có quyền sửa character này');
    }

    if (name) character.name = name.trim();
    if (url) character.url = url.trim();

    await character.save();

    return res.status(200).json({ message: 'Cập nhật character thành công', character });
  } catch (error) {
    next(error);
  }
};

// Delete character (only owner can delete)
export const deleteCharacterController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const character = await Character.findById(id);
    if (!character) throw new NotFoundError('Character không tìm thấy');

    if (String(character.createdBy) !== String(userId)) {
      throw new ForbiddenError('Không có quyền xóa character này');
    }

    await Character.deleteOne({ _id: id });

    // Also remove from any user's characterUrl field if equals this url
    await User.updateMany({ characterUrl: character.url }, { $set: { characterUrl: null } });

    return res.status(200).json({ message: 'Xóa character thành công' });
  } catch (error) {
    next(error);
  }
};

// List characters with optional filter by owner
export const listCharactersController = async (req, res, next) => {
  try {
    // Return all characters (ignore owner query) per request
    const characters = await Character.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ characters });
  } catch (error) {
    next(error);
  }
};

// Attach a character URL to current user (adds url to user's charactersUrl array)
export const attachCharacterToUserController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { characterId } = req.body;

    if (!characterId) throw new BadRequestError('characterId là bắt buộc');

    const character = await Character.findById(characterId);
    if (!character) throw new NotFoundError('Character không tìm thấy');

    // Set user's selected characterUrl
    await User.updateOne({ _id: userId }, { $set: { characterUrl: character.url } });

    return res.status(200).json({ message: 'Đã thêm character vào user', url: character.url });
  } catch (error) {
    next(error);
  }
};

// Detach a character URL from current user
export const detachCharacterFromUserController = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { url } = req.body;

    if (!url) throw new BadRequestError('url là bắt buộc');

    // Only unset if the user's current characterUrl equals provided url
    await User.updateOne({ _id: userId, characterUrl: url }, { $set: { characterUrl: null } });

    return res.status(200).json({ message: 'Đã xóa character khỏi user', url });
  } catch (error) {
    next(error);
  }
};
