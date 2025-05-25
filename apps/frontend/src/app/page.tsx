import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icons } from "@/components/ui/icons"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative bg-gray-950">
    {/* Background with animated gradient */}
    <div className="absolute inset-0 overflow-hidden -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-purple-950/10 to-gray-950"></div>
      <div className="absolute w-[500px] h-[500px] rounded-full bg-purple-500/20 blur-[120px] -top-40 -left-20 animate-pulse"></div>
      <div className="absolute w-[400px] h-[400px] rounded-full bg-blue-500/20 blur-[120px] top-1/2 -right-20 animate-pulse"></div>
    </div>
    
    <Navbar />
    
    <main className="flex-1 flex flex-col items-center justify-center pt-24 pb-16 px-4">
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-3xl mx-auto mb-12 animate-fade-in">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-br from-white to-gray-300 bg-clip-text text-transparent">
          Live Video Streaming Platform
        </h1>
        <p className="text-gray-400 text-lg md:text-xl max-w-xl mx-auto">
          Join or watch high-quality, low-latency live streams with our powerful WebRTC platform
        </p>
        <div className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-red-500/10 border border-red-500/20 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-red-400">Live streams available now</span>
        </div>
      </div>
      
      {/* Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full mb-12">
        <Card className="group hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300 overflow-hidden bg-gray-900/80 backdrop-blur-sm border-gray-800 hover:border-purple-500/50">
          <CardHeader className="pb-2">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-lg shadow-purple-500/20">
              <Icons.video className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl md:text-3xl text-white">Join Stream</CardTitle>
            <CardDescription className="text-base text-gray-400">
              Connect with your camera and microphone to participate in the live stream experience
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center mt-0.5">
                  <Icons.camera className="w-3 h-3 text-purple-400" />
                </div>
                <p className="text-sm text-gray-400">Share your video with other participants</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center mt-0.5">
                  <Icons.mic className="w-3 h-3 text-purple-400" />
                </div>
                <p className="text-sm text-gray-400">Communicate with crystal clear audio</p>
              </div>
            </div>
            <Link href='/stream'>
              <Button
                className="w-full mt-8 bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 group-hover:scale-[1.02] transition-all text-white" 
                size="lg"
              >
                <span className="flex items-center gap-2">
                  Enter as Peer
                  <Icons.circlePlay className="w-4 h-4" />
                </span>
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-300 overflow-hidden bg-gray-900/80 backdrop-blur-sm border-gray-800 hover:border-blue-500/50">
          <CardHeader className="pb-2">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-lg shadow-blue-500/20">
              <Icons.monitor className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl md:text-3xl text-white">Watch Stream</CardTitle>
            <CardDescription className="text-base text-gray-400">
              View the live stream as a spectator without joining as a participant
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                  <Icons.play className="w-3 h-3 text-blue-400" />
                </div>
                <p className="text-sm text-gray-400">High-definition video streaming</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center mt-0.5">
                  <Icons.volume2 className="w-3 h-3 text-blue-400" />
                </div>
                <p className="text-sm text-gray-400">Immersive audio experience</p>
              </div>
            </div>
            <Link href='/watch'>
              <Button
                className="w-full mt-8 bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 group-hover:scale-[1.02] transition-all text-white" 
                size="lg"
              >
                <span className="flex items-center gap-2">
                  Watch Live
                  <Icons.play className="w-4 h-4" />
                </span>
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      
      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl w-full mb-16 mt-8">
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-purple-400 to-blue-400 bg-clip-text text-transparent">99.9%</h4>
          <p className="text-sm text-gray-400 mt-1">Uptime</p>
        </div>
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-purple-400 to-blue-400 bg-clip-text text-transparent">300ms</h4>
          <p className="text-sm text-gray-400 mt-1">Latency</p>
        </div>
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-purple-400 to-blue-400 bg-clip-text text-transparent">5K+</h4>
          <p className="text-sm text-gray-400 mt-1">Active Users</p>
        </div>
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-purple-400 to-blue-400 bg-clip-text text-transparent">4.8/5</h4>
          <p className="text-sm text-gray-400 mt-1">User Rating</p>
        </div>
      </div>
    </main>
    <Footer />
  </div>
  )
}
