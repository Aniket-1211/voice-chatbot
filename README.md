# Voice Chatbot

A simple English voice assistant with:

- React + Vite frontend
- Express backend
- Gemini API responses
- Browser speech recognition and speech synthesis
- Local JSON memory with no registration

## Setup

Install dependencies:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Create `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=5000
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000
```

Run the app:

```bash
cd backend
npm run dev

cd ../frontend
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

Voice input works best in Chrome or Edge because it uses the browser `SpeechRecognition` API.
