import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { useState, FormEvent, useEffect, useRef } from "react";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm p-4 flex justify-between items-center border-b">
        <h2 className="text-xl font-semibold accent-text">Learning Chatbot</h2>
        <SignOutButton />
      </header>
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl mx-auto">
          <Content />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
  const loggedInUser = useQuery(api.auth.loggedInUser);
  const messages = useQuery(api.chat.listMessages) || [];
  const training = useQuery(api.chat.listTraining) || [];
  const sendMessage = useMutation(api.chat.sendMessage);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    await sendMessage({
      content: newMessage,
    });
    setNewMessage("");
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold accent-text mb-4">Learning Chatbot</h1>
        <Authenticated>
          <p className="text-xl text-slate-600">
            A chatbot that learns from you and the web!
          </p>
          <div className="text-sm text-slate-500 mt-2 space-y-1">
            <p>Train me directly: /train pattern | response</p>
            <p>Train me from a webpage: /learn URL</p>
          </div>
        </Authenticated>
        <Unauthenticated>
          <p className="text-xl text-slate-600">Sign in to start chatting</p>
        </Unauthenticated>
      </div>

      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>

      <Authenticated>
        <div className="flex flex-col gap-4">
          <div className="h-[400px] overflow-y-auto border rounded-lg p-4 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message._id}
                className={`mb-4 ${
                  message.role === "user" ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`inline-block p-3 rounded-lg ${
                    message.role === "user"
                      ? "bg-indigo-500 text-white"
                      : "bg-white border"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Chat, use /train to teach me, or /learn URL to learn from web..."
              className="flex-1 p-2 border rounded"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="px-4 py-2 bg-indigo-500 text-white rounded disabled:opacity-50"
            >
              Send
            </button>
          </form>

          <div className="mt-4">
            <h3 className="text-lg font-semibold mb-2">Training Data</h3>
            <div className="border rounded-lg p-4 bg-gray-50">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left">Pattern</th>
                    <th className="text-left">Response</th>
                    <th className="text-left">Source</th>
                    <th className="text-right">Uses</th>
                  </tr>
                </thead>
                <tbody>
                  {training.map((t) => (
                    <tr key={t._id} className="border-t">
                      <td className="py-2">{t.pattern}</td>
                      <td className="py-2">{t.response}</td>
                      <td className="py-2">{t.source}</td>
                      <td className="py-2 text-right">{t.uses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Authenticated>
    </div>
  );
}
