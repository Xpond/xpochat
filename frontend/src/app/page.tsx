import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen relative z-10 flex flex-col items-center justify-center p-8">
      <div className="max-w-7xl mx-auto text-center">
        {/* Hero Section */}
        <div className="mb-24">
          <h1 className="text-8xl md:text-9xl lg:text-[10rem] font-light bg-gradient-to-r from-teal-300 via-teal-400 to-teal-500 bg-clip-text text-transparent mb-8 tracking-tight leading-none animate-fade-in-up">
            Xpochat
          </h1>
          <p className="text-2xl md:text-3xl lg:text-4xl text-gray-200 font-light mb-6 tracking-wide max-w-4xl mx-auto animate-fade-in-up delay-200">
            Lightning-fast AI conversations that think at the speed of your thoughts
          </p>
          <p className="text-lg md:text-xl text-gray-400 font-light max-w-2xl mx-auto leading-relaxed animate-fade-in-up delay-300">
            Experience the future of AI chat with instant responses, beautiful simplicity, and powerful multimodal capabilities
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20 max-w-5xl mx-auto">
          <div className="group cursor-default animate-slide-in-left delay-400">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-teal-300 mb-2">Ultra-Fast Streaming</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Token-by-token streaming at 240+ chars/second with buttery smooth 60fps rendering
            </p>
          </div>
          
          <div className="group cursor-default animate-slide-in-center delay-500">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-teal-300 mb-2">Beautifully Simple</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Zero bloat design with intelligent UI that stays out of your way while you think
            </p>
          </div>
          
          <div className="group cursor-default animate-slide-in-right delay-600">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-teal-400 to-teal-600 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3.586l6.879-6.879A6 6 0 0121 9z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-teal-300 mb-2">Bring Your Own Key</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Use your own API keys for unlimited access to GPT-4, Claude, Gemini, and more
            </p>
          </div>
        </div>

        {/* Call to Action */}
        <div className="space-y-6 animate-fade-in-up delay-400">
          <Link
            href="/sign-in"
            className="inline-block bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white px-20 py-6 rounded-full font-medium text-xl transition-all duration-300 shadow-2xl hover:shadow-teal-500/30 hover:scale-105 transform group"
          >
            <span className="flex items-center gap-3">
              Start Chatting
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </span>
          </Link>
          
          <div className="flex items-center justify-center gap-8 text-sm text-gray-500 animate-fade-in delay-500">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
              50 free messages
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
              No credit card required
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
              Instant setup
            </span>
          </div>
          
          <div className="mt-8 animate-fade-in delay-600">
            <Link
              href="/sign-up"
              className="text-teal-400 hover:text-teal-300 text-lg font-medium transition-colors duration-300 underline decoration-teal-400/30 hover:decoration-teal-300/50 underline-offset-4"
            >
              New here? Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
