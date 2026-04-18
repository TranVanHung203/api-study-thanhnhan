# Chatbot Module (Hybrid Parse + Gemini Normalize)

All chatbot code is grouped in one folder: `src/chatbot`.

## Architecture

1. Upload document (`.docx/.pdf/.txt/.md/.csv/.json/.log`).
2. Backend parses text locally (for stability): `txt/md/csv/json/log/pdf/docx`.
3. Parsed text is sent to Gemini only for normalization to structured JSON entries:
   - `key`
   - `aliases`
   - `answer`
   - `topic`
   - `intentType`
   - `entityType`
   - `tags`
   - `source`
4. Entries are saved to MongoDB database `chatbot_thanhnhan`.
5. Chat endpoint does not call AI. It searches MongoDB with priority:
   - Atlas Search / Text Index first
   - Regex only when no Atlas/Text result
   - Stopword filtering + phrase-first scoring for better precision
   - Confidence + score-gap check to avoid wrong confident answers

## Database

- Default DB name: `chatbot_thanhnhan`
- Connection priority:
  - `CHATBOT_MONGO_URI`
  - fallback `MONGO_URI`

## Environment variables

- `CHATBOT_DB_NAME=chatbot_thanhnhan`
- `GEMINI_API_KEY=<YOUR_GEMINI_API_KEY>`
- `GEMINI_TEXT_MODEL=gemini-2.5-flash`
- `GEMINI_TEXT_TIMEOUT_MS=180000`
- `GEMINI_TEXT_MAX_OUTPUT_TOKENS=8192`
- `CHATBOT_MAX_TEXT_CHARS=90000`
- `CHATBOT_MAX_ENTRIES_PER_FILE=180`
- `CHATBOT_SEARCH_LIMIT=30`
- `CHATBOT_MIN_MATCH_SCORE=1.4`
- `CHATBOT_MIN_SCORE_GAP=0.55`
- `CHATBOT_USE_ATLAS_SEARCH=true`
- `CHATBOT_ATLAS_SEARCH_INDEX=chatbot_knowledge_index`

## API Endpoints

- `POST /chatbot/documents/upload`
  - multipart field: `files` (max 20)
  - optional body: `userId`
- `GET /chatbot/documents?userId=...`
- `GET /chatbot/conversations?userId=...`
- `GET /chatbot/conversations/:conversationId/messages?userId=...`
- `POST /chatbot/chat/send`
  - body:
    ```json
    {
      "userId": "u_1",
      "conversationId": "optional",
      "selectedDocumentIds": ["docId1", "docId2"],
      "message": "Noi dung can hoi"
    }
    ```

## Notes

- System prompt for Gemini normalization is hardcoded in `src/chatbot/services.js`.
- If Gemini returns no valid structured entries, backend auto-creates one fallback summary entry so upload does not fail hard.
- Answers are post-processed to keep natural tone and avoid meta openings like "Theo tai lieu...".
- Uploaded temp files are removed after processing.
