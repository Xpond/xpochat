import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen relative z-10 flex flex-col items-center justify-center p-8">
      <div className="max-w-6xl mx-auto text-center">
        {/* Hero Section */}
        <div className="mb-20">
          <h1 className="text-8xl md:text-9xl font-light bg-gradient-to-r from-teal-300 via-teal-400 to-teal-500 bg-clip-text text-transparent mb-12 tracking-tight leading-none">
            Xpochat
          </h1>
          <p className="text-3xl md:text-4xl text-gray-200 font-light mb-16 tracking-wide">
            It is faster than you can think
          </p>
        </div>

        {/* Single CTA */}
        <div>
          <Link
            href="/sign-in"
            className="inline-block bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white px-16 py-5 rounded-full font-medium text-xl transition-all duration-300 shadow-2xl hover:shadow-teal-500/30 hover:scale-105 transform"
          >
            Start Chatting
          </Link>
          <div className="mt-8">
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
