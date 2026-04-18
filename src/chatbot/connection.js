import 'dotenv/config';
import mongoose from 'mongoose';

const DEFAULT_CHATBOT_DB_NAME = 'chatbot_thanhnhan';
let chatbotConnectionPromise;

const getMongoUri = () => {
  const uri = process.env.CHATBOT_MONGO_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error('Missing MONGO_URI (or CHATBOT_MONGO_URI) for chatbot module.');
  }

  return uri;
};

export const getChatbotConnection = async () => {
  if (!chatbotConnectionPromise) {
    const mongoUri = getMongoUri();
    const dbName = process.env.CHATBOT_DB_NAME || DEFAULT_CHATBOT_DB_NAME;

    const connection = mongoose.createConnection(mongoUri, {
      dbName
    });

    connection.on('error', (error) => {
      console.error('[chatbot] MongoDB connection error:', error.message);
    });

    chatbotConnectionPromise = connection.asPromise()
      .then((connectedConnection) => {
        console.log(`[chatbot] Connected MongoDB database: ${dbName}`);
        return connectedConnection;
      })
      .catch((error) => {
        chatbotConnectionPromise = null;
        throw error;
      });
  }

  return chatbotConnectionPromise;
};
