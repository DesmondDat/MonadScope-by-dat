export default function Header() {
  return (
    <header className="border-b border-gray-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg"></div>
          <span className="text-xl font-bold">Monad Scanner</span>
        </div>
        <nav className="hidden md:flex space-x-6">
          <a href="#features" className="text-gray-300 hover:text-white transition">Features</a>
          <a href="https://github.com" className="text-gray-300 hover:text-white transition">GitHub</a>
        </nav>
      </div>
    </header>
  )
}

