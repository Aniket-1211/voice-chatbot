import { Mic, MicOff, Send, Volume2, VolumeX } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi, I am ready. You can type or speak in English."
    }
  ]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [speakerOn, setSpeakerOn] = useState(true);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");

  const voiceSupported = useMemo(() => Boolean(SpeechRecognition), []);
  const statusDotClass =
    {
      idle: "bg-slate-400",
      listening: "bg-rose-500",
      thinking: "bg-amber-500",
      speaking: "bg-emerald-600"
    }[status] || "bg-slate-400";

  React.useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

  function speak(text) {
    if (!speakerOn || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(text = input) {
    const cleanText = text.trim();
    if (!cleanText || status === "thinking") return;

    setError("");
    setInput("");
    setStatus("thinking");
    setMessages((current) => [...current, { role: "user", text: cleanText }]);

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: cleanText })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed.");

      setMessages((current) => [...current, { role: "assistant", text: data.reply }]);
      speak(data.reply);
      if (!speakerOn) setStatus("idle");
    } catch (requestError) {
      setError(requestError.message);
      setStatus("idle");
    }
  }

  function startListening() {
    if (!voiceSupported || status === "listening") return;

    window.speechSynthesis?.cancel();
    transcriptRef.current = "";

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setStatus("listening");
      setError("");
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      transcriptRef.current = transcript;
      setInput(transcript);
    };

    recognition.onend = () => {
      const finalTranscript = transcriptRef.current.trim();
      setStatus("idle");
      if (finalTranscript) sendMessage(finalTranscript);
    };

    recognition.onerror = (event) => {
      setError(event.error === "not-allowed" ? "Microphone permission was blocked." : "Voice input failed.");
      setStatus("idle");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setStatus("idle");
  }

  return (
    <main className="min-h-screen bg-[#eef7f3] px-3 py-3 text-slate-900 sm:px-6 sm:py-6">
      <section className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-5xl flex-col sm:min-h-[calc(100vh-3rem)]">
        <div className="grid min-h-[calc(100vh-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto_auto_auto] overflow-hidden rounded-lg border border-white/80 bg-white shadow-[0_24px_70px_rgba(15,55,45,0.16)] sm:min-h-[calc(100vh-3rem)]">
          <header className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 bg-[#dff1eb] px-4 py-5 sm:px-6 sm:py-6">
            <div className="col-start-2 text-center">
              <h1 className="mx-auto max-w-2xl text-2xl font-semibold leading-tight tracking-normal text-[#10251f] sm:text-4xl">
                Talk naturally. I will remember what matters.
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Type, speak, and get a voice reply in English.
              </p>
            </div>
            <button
              className="col-start-3 grid size-11 place-items-center rounded-lg border border-emerald-900/10 bg-white text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-55"
              type="button"
              title={speakerOn ? "Turn voice off" : "Turn voice on"}
              onClick={() => {
                window.speechSynthesis?.cancel();
                setSpeakerOn((value) => !value);
              }}
            >
              {speakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
          </header>

          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto bg-[#f8fbfa] px-4 py-5 sm:px-8 sm:py-7" aria-live="polite">
            {messages.map((message, index) => (
              <article
                className={`max-w-[94%] sm:max-w-[76%] ${message.role === "user" ? "self-end" : "self-start"}`}
                key={`${message.role}-${index}`}
              >
                <span
                  className={`mb-1.5 block text-xs font-semibold uppercase tracking-normal text-slate-500 ${
                    message.role === "user" ? "text-right" : ""
                  }`}
                >
                  {message.role === "user" ? "You" : "Assistant"}
                </span>
                <p
                  className={`rounded-lg px-4 py-3 text-[0.96rem] leading-relaxed shadow-sm ${
                    message.role === "user"
                      ? "bg-[#17624f] text-white"
                      : "border border-emerald-900/10 bg-white text-slate-800"
                  }`}
                >
                  {message.text}
                </p>
              </article>
            ))}
          </div>

          {error && (
            <p className="mx-4 mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 sm:mx-8">
              {error}
            </p>
          )}

          <form
            className="grid grid-cols-[48px_minmax(0,1fr)_48px] gap-3 border-t border-emerald-900/10 bg-white px-4 py-4 sm:px-8"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <button
              className={`grid size-12 place-items-center rounded-lg border shadow-sm transition disabled:opacity-55 ${
                status === "listening"
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "border-emerald-900/10 bg-[#eef7f3] text-emerald-900 hover:bg-emerald-100"
              }`}
              type="button"
              title={status === "listening" ? "Stop listening" : "Start listening"}
              onClick={status === "listening" ? stopListening : startListening}
              disabled={!voiceSupported || status === "thinking" || status === "speaking"}
            >
              {status === "listening" ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={voiceSupported ? "Type or use the mic..." : "Type your message..."}
              disabled={status === "thinking"}
              className="min-w-0 rounded-lg border border-emerald-900/10 bg-[#f8fbfa] px-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-55"
            />
            <button
              className="grid size-12 place-items-center rounded-lg border border-[#17624f] bg-[#17624f] text-white shadow-sm transition hover:bg-[#124f40] disabled:opacity-55"
              type="submit"
              title="Send message"
              disabled={!input.trim()}
            >
              <Send size={20} />
            </button>
          </form>

          <footer className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 bg-white px-4 pb-4 text-sm text-slate-500 sm:px-8">
            <span className={`size-2.5 rounded-full ${statusDotClass}`} />
            <span>{status === "idle" ? "Ready" : status.charAt(0).toUpperCase() + status.slice(1)}</span>
            {!voiceSupported && <span>Voice input works best in Chrome or Edge.</span>}
          </footer>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
