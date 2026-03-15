// "use client";

// import { useState } from "react";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";
// import { connectToStream } from "@/app/lib/sse";
// import { StreamEvent } from "@/app/types/stream";

// export default function BlogGenerator() {
//   const [topic, setTopic] = useState("");
//   const [content, setContent] = useState("");
//   const [loading, setLoading] = useState(false);

//   const handleGenerate = () => {
//     if (!topic.trim()) return;

//     setContent("");
//     setLoading(true);

//     connectToStream(
//       topic,
//       (data: StreamEvent) => {
//         if (data.type === "section") {
//           // Append streamed content into single message
//           setContent((prev) => prev + "\n\n" + data.content);
//         }

//         if (data.type === "error") {
//           console.error(data.message);
//           setLoading(false);
//         }
//       },
//       () => setLoading(false)
//     );
//   };

//   return (
//     <div className="flex flex-col h-screen bg-linear-to-br from-gray-50 to-gray-100">

//       {/* Header */}
//       <div className="border-b bg-white px-6 py-4 shadow-sm">
//         <h1 className="text-lg font-semibold text-gray-800">
//           AI Blog Generator
//         </h1>
//       </div>

//       {/* Messages Area */}
//       <div className="flex-1 overflow-y-auto px-4 py-8">
//         <div className="max-w-3xl mx-auto w-full">

//           {/* AI Response */}
//           {content && (
//             <div className="flex items-start gap-4">
              
//               {/* Avatar */}
//               <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-sm font-semibold shadow">
//                 AI
//               </div>

//               {/* Message Bubble */}
//               <div className="bg-white border border-gray-100 rounded-3xl px-10 py-8 shadow-lg max-w-[85%] hover:shadow-xl transition-all duration-300">
//                 <ReactMarkdown
//                   remarkPlugins={[remarkGfm]}
//                   components={{
//                     h2: ({ children }) => (
//                       <h2 className="text-2xl font-bold mt-8 mb-4 text-gray-900 border-b pb-2">
//                         {children}
//                       </h2>
//                     ),
//                     ul: ({ children }) => (
//                       <ul className="list-disc pl-6 space-y-2 my-4 text-gray-700">
//                         {children}
//                       </ul>
//                     ),
//                     li: ({ children }) => (
//                       <li className="leading-relaxed text-[15px]">
//                         {children}
//                       </li>
//                     ),
//                     a: ({ href, children }) => (
//                       <a
//                         href={href}
//                         target="_blank"
//                         className="text-blue-600 hover:text-blue-800 underline transition"
//                       >
//                         {children}
//                       </a>
//                     ),
//                     p: ({ children }) => (
//                       <p className="text-gray-700 leading-relaxed my-3 text-[15px]">
//                         {children}
//                       </p>
//                     ),
//                   }}
//                 >
//                   {content}
//                 </ReactMarkdown>
//               </div>
//             </div>
//           )}

//           {/* Loading */}
//           {loading && (
//             <div className="flex items-center gap-4 mt-6">
//               <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center text-sm font-semibold">
//                 AI
//               </div>
//               <div className="bg-white border border-gray-200 rounded-2xl px-6 py-4 animate-pulse shadow-sm">
//                 Thinking...
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Input Area */}
//       <div className="border-t bg-white p-4 shadow-inner">
//         <div className="max-w-3xl mx-auto flex gap-3 items-center">
//           <input
//             value={topic}
//             onChange={(e) => setTopic(e.target.value)}
//             placeholder="Message AI..."
//             className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black"
//           />
//           <button
//             onClick={handleGenerate}
//             disabled={loading}
//             className="bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
//           >
//             Send
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }