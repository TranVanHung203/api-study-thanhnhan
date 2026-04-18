import {
  uploadAndIndexDocuments,
  listDocuments,
  sendChatMessage,
  listConversations,
  getConversationMessages
} from './services.js';

const resolveUserIdFromRequest = (req) => {
  return req.user?.id || req.body?.userId || req.query?.userId || 'anonymous';
};

export const uploadDocumentsController = async (req, res, next) => {
  try {
    const userId = resolveUserIdFromRequest(req);
    const files = req.files || [];
    const results = await uploadAndIndexDocuments({ files, userId });

    return res.status(200).json({
      message: 'Upload and knowledge extraction completed.',
      userId,
      results
    });
  } catch (error) {
    return next(error);
  }
};

export const listDocumentsController = async (req, res, next) => {
  try {
    const userId = resolveUserIdFromRequest(req);
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitRaw) ? 100 : limitRaw;

    const documents = await listDocuments({ userId, limit });

    return res.status(200).json({
      userId,
      count: documents.length,
      documents
    });
  } catch (error) {
    return next(error);
  }
};

export const listConversationsController = async (req, res, next) => {
  try {
    const userId = resolveUserIdFromRequest(req);
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitRaw) ? 50 : limitRaw;

    const conversations = await listConversations({ userId, limit });

    return res.status(200).json({
      userId,
      count: conversations.length,
      conversations
    });
  } catch (error) {
    return next(error);
  }
};

export const getConversationMessagesController = async (req, res, next) => {
  try {
    const userId = resolveUserIdFromRequest(req);
    const { conversationId } = req.params;
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isNaN(limitRaw) ? 100 : limitRaw;

    const messages = await getConversationMessages({
      conversationId,
      userId,
      limit
    });

    return res.status(200).json({
      conversationId,
      userId,
      count: messages.length,
      messages
    });
  } catch (error) {
    return next(error);
  }
};

export const sendChatMessageController = async (req, res, next) => {
  try {
    const userId = resolveUserIdFromRequest(req);
    const { conversationId, selectedDocumentIds, message } = req.body || {};

    const result = await sendChatMessage({
      userId,
      conversationId,
      selectedDocumentIds,
      message
    });

    return res.status(200).json({
      userId,
      ...result
    });
  } catch (error) {
    return next(error);
  }
};
