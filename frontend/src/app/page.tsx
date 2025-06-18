import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen relative z-10 flex flex-col items-center justify-center p-8">
      <div className="max-w-5xl mx-auto text-center">
        {/* Hero Section */}
        <div className="mb-16">
          <h1 className="text-7xl md:text-8xl font-light bg-gradient-to-r from-teal-300 via-teal-400 to-teal-500 bg-clip-text text-transparent mb-8 tracking-tight">
            Xpochat
          </h1>
          <p className="text-2xl md:text-3xl text-gray-200 font-light mb-6 max-w-3xl mx-auto leading-relaxed">
            AI conversations that feel impossibly fast and beautifully simple
          </p>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Experience the future of AI chat with real-time responses and an interface designed for pure conversation
          </p>
        </div>

        {/* Main CTA */}
        <div className="mb-20">
          <Link
            href="/sign-in"
            className="inline-block bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white px-12 py-4 rounded-full font-medium text-lg transition-all duration-300 shadow-2xl hover:shadow-teal-500/25 hover:scale-105 transform"
          >
            Start Chatting
          </Link>
          <div className="mt-6">
            <Link
              href="/sign-up"
              className="text-teal-400 hover:text-teal-300 text-sm font-medium transition-colors duration-300 underline decoration-teal-400/30 hover:decoration-teal-300/50 underline-offset-4"
            >
              New here? Create an account
            </Link>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="group">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500/20 to-teal-600/20 border border-teal-500/30 rounded-2xl mx-auto mb-6 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <div className="text-2xl">⚡</div>
            </div>
            <h3 className="text-xl font-medium text-white mb-3">Lightning Fast</h3>
            <p className="text-gray-400 leading-relaxed">
              Real-time streaming responses that appear as fast as you can think
            </p>
          </div>
          
          <div className="group">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500/20 to-teal-600/20 border border-teal-500/30 rounded-2xl mx-auto mb-6 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <div className="text-2xl">✨</div>
            </div>
            <h3 className="text-xl font-medium text-white mb-3">Radically Simple</h3>
            <p className="text-gray-400 leading-relaxed">
              Zero clutter, infinite focus. Just you and the conversation
            </p>
          </div>
          
          <div className="group">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500/20 to-teal-600/20 border border-teal-500/30 rounded-2xl mx-auto mb-6 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <div className="text-2xl">🎯</div>
            </div>
            <h3 className="text-xl font-medium text-white mb-3">Your Models</h3>
            <p className="text-gray-400 leading-relaxed">
              Bring your own API keys for unlimited access to any AI model
            </p>
          </div>
        </div>

        {/* Subtle Secondary CTA */}
        <div className="mt-20 pt-12 border-t border-teal-800/20">
          <p className="text-gray-500 text-sm mb-4">
            Ready to experience AI conversations differently?
          </p>
          <Link
            href="/sign-in"
            className="text-teal-400 hover:text-teal-300 font-medium transition-colors duration-300"
          >
            Get started →
          </Link>
        </div>
      </div>
    </div>
  );
}
