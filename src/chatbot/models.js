import mongoose from 'mongoose';
import { getChatbotConnection } from './connection.js';

const { Schema } = mongoose;

const documentSchema = new Schema(
  {
    userId: {
      type: String,
      default: 'anonymous',
      index: true
    },
    originalName: {
      type: String,
      required: true
    },
    storedName: {
      type: String,
      required: true
    },
    storagePath: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
      index: true
    },
    entryCount: {
      type: Number,
      default: 0
    },
    domain: {
      type: String,
      default: 'general',
      index: true
    },
    errorMessage: {
      type: String,
      default: null
    },
    geminiFileName: {
      type: String,
      default: null
    },
    geminiFileUri: {
      type: String,
      default: null
    },
    geminiFileState: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ userId: 1, status: 1, createdAt: -1 });

const knowledgeSchema = new Schema(
  {
    userId: {
      type: String,
      default: 'anonymous',
      index: true
    },
    documentId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ChatbotDocument',
      index: true
    },
    key: {
      type: String,
      required: true
    },
    keyNormalized: {
      type: String,
      required: true,
      index: true
    },
    aliases: {
      type: [String],
      default: []
    },
    answer: {
      type: String,
      required: true
    },
    topic: {
      type: String,
      default: ''
    },
    intentType: {
      type: String,
      default: 'fact',
      index: true
    },
    entityType: {
      type: String,
      default: 'general',
      index: true
    },
    keyPhrases: {
      type: [String],
      default: []
    },
    tags: {
      type: [String],
      default: []
    },
    source: {
      type: String,
      default: ''
    },
    domain: {
      type: String,
      default: 'general',
      index: true
    },
    searchText: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

knowledgeSchema.index({ userId: 1, documentId: 1, topic: 1 });
knowledgeSchema.index({ userId: 1, documentId: 1, intentType: 1, entityType: 1 });
knowledgeSchema.index(
  {
    key: 'text',
    aliases: 'text',
    keyPhrases: 'text',
    answer: 'text',
    topic: 'text',
    intentType: 'text',
    entityType: 'text',
    tags: 'text',
    source: 'text',
    searchText: 'text'
  },
  { name: 'chatbot_knowledge_text_idx' }
);

const conversationSchema = new Schema(
  {
    userId: {
      type: String,
      default: 'anonymous',
      index: true
    },
    title: {
      type: String,
      default: ''
    },
    selectedDocumentIds: {
      type: [Schema.Types.ObjectId],
      default: []
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

conversationSchema.index({ userId: 1, lastMessageAt: -1 });

const messageSourceSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    documentName: {
      type: String,
      required: true
    },
    entryId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    key: {
      type: String,
      required: true
    },
    topic: {
      type: String,
      default: ''
    },
    intentType: {
      type: String,
      default: 'fact'
    },
    entityType: {
      type: String,
      default: 'general'
    },
    matchedBy: {
      type: String,
      enum: ['atlas', 'text', 'regex', 'hybrid', 'fallback'],
      default: 'fallback'
    },
    score: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'ChatbotConversation',
      index: true
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    sources: {
      type: [messageSourceSchema],
      default: []
    }
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });

let cachedModels;

export const getChatbotModels = async () => {
  if (cachedModels) {
    return cachedModels;
  }

  const connection = await getChatbotConnection();

  const ChatbotDocument = connection.models.ChatbotDocument
    || connection.model('ChatbotDocument', documentSchema);
  const ChatbotKnowledge = connection.models.ChatbotKnowledge
    || connection.model('ChatbotKnowledge', knowledgeSchema);
  const ChatbotConversation = connection.models.ChatbotConversation
    || connection.model('ChatbotConversation', conversationSchema);
  const ChatbotMessage = connection.models.ChatbotMessage
    || connection.model('ChatbotMessage', messageSchema);

  cachedModels = {
    ChatbotDocument,
    ChatbotKnowledge,
    ChatbotConversation,
    ChatbotMessage
  };

  return cachedModels;
};
