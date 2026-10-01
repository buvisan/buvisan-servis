'use client';
import { useChat } from '@ai-sdk/react';

export default function AiAsistan() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();

  return (
    <div className="flex flex-col h-[500px] w-[400px] border border-gray-300 p-4 bg-white rounded-xl shadow-2xl fixed bottom-5 right-5 z-[99999]">
      <div className="bg-slate-900 text-white p-3 -mx-4 -mt-4 mb-4 rounded-t-xl font-bold">
        Buvisan Otonom Asistan
      </div>
      
      <div className="flex-1 overflow-y-auto mb-4 space-y-3">
        {messages.map(m => (
          <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block p-2 rounded-lg ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-slate-800'}`}>
              {m.content}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="border border-gray-300 p-2 flex-1 rounded-lg text-black outline-none focus:border-blue-500"
          value={input}
          placeholder="Asistana bir talimat ver..."
          onChange={handleInputChange}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Gönder
        </button>
      </form>
    </div>
  );
}