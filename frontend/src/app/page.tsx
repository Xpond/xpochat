import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen relative z-10 flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-teal-400 to-teal-600 bg-clip-text text-transparent mb-6">
          Xpochat
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Experience the future of AI chat with lightning-fast responses and beautifully simple interface
        </p>
        
        <div className="bg-black/20 backdrop-blur-md border border-teal-800/30 rounded-lg p-8 shadow-2xl">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Welcome to the Future of AI Conversations
          </h2>
          <p className="text-gray-300 mb-6">
            Lightning fast • Beautifully simple • Incredibly powerful
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="p-4">
              <div className="w-12 h-12 bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg mx-auto mb-3 flex items-center justify-center">
                ⚡
              </div>
              <h3 className="text-white font-semibold mb-2">Lightning Fast</h3>
              <p className="text-gray-400 text-sm">Real-time responses with DiceDB memory</p>
            </div>
            
            <div className="p-4">
              <div className="w-12 h-12 bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg mx-auto mb-3 flex items-center justify-center">
                ✨
              </div>
              <h3 className="text-white font-semibold mb-2">Beautiful</h3>
              <p className="text-gray-400 text-sm">Elegant interface with radical simplicity</p>
            </div>
            
            <div className="p-4">
              <div className="w-12 h-12 bg-gradient-to-r from-teal-600 to-teal-700 rounded-lg mx-auto mb-3 flex items-center justify-center">
                🚀
              </div>
              <h3 className="text-white font-semibold mb-2">Powerful</h3>
              <p className="text-gray-400 text-sm">Multi-modal AI with streaming intelligence</p>
            </div>
          </div>
          
          <div className="mt-8">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/sign-in"
                className="inline-block bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="inline-block bg-transparent border-2 border-teal-600 hover:bg-teal-600 text-teal-400 hover:text-white px-8 py-3 rounded-lg font-semibold transition-all duration-300"
              >
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
