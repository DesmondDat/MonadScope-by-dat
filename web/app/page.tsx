'use client'

import { useState } from 'react'
import TokenScanner from './components/TokenScanner'
import Header from './components/Header'
import Features from './components/Features'

export default function Home() {
  return (
    <main className="min-h-screen">
      <Header />
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Monad Token Scanner
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Discover the most profitable wallets for any token on Monad blockchain.
            Real-time scanning with USD profit calculations.
          </p>
        </div>
        
        <TokenScanner />
        
        <Features />
      </div>
      
      <footer className="mt-20 py-8 text-center text-gray-400 border-t border-gray-800">
        <p>Built for Monad Blockchain • Open Source</p>
      </footer>
    </main>
  )
}

