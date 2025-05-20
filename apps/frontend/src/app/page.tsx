import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Icons } from "@/components/ui/icons"
import Navbar from "@/components/navbar"
import Footer from "@/components/footer"

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen relative">
    {/* Background with animated gradient */}
    <div className="absolute inset-0 overflow-hidden -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-purple-900/10 to-background"></div>
      <div className="absolute w-[500px] h-[500px] rounded-full bg-primary/20 blur-[120px] -top-40 -left-20"></div>
      <div className="absolute w-[400px] h-[400px] rounded-full bg-purple-500/20 blur-[120px] top-1/2 -right-20"></div>
    </div>
    
    <Navbar />
    
    <main className="flex-1 flex flex-col items-center justify-center pt-24 pb-16 px-4">
      {/* Hero Section */}
      <div className="text-center space-y-6 max-w-3xl mx-auto mb-12 animate-fade-in">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-br from-white to-white/70 bg-clip-text text-transparent">
          Live Video Streaming Platform
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-xl mx-auto">
          Join or watch high-quality, low-latency live streams with our powerful WebRTC platform
        </p>
        <div className="inline-flex items-center gap-2 py-1 px-3 rounded-full bg-primary/10 border border-primary/20 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          Live streams available now
        </div>
      </div>
      
      {/* Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full mb-12">
        <Card className="group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 overflow-hidden bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-lg shadow-primary/20">
              <Icons.video className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl md:text-3xl">Join Stream</CardTitle>
            <CardDescription className="text-base">
              Connect with your camera and microphone to participate in the live stream experience
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                  <Icons.camera className="w-3 h-3 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Share your video with other participants</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                  <Icons.mic className="w-3 h-3 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">Communicate with crystal clear audio</p>
              </div>
            </div>
            <Button asChild className="w-full mt-8 group-hover:bg-primary/90 group-hover:scale-[1.02] transition-all" size="lg">
              <Link href="/stream" className="flex items-center gap-2">
                Enter as Peer
                <Icons.circlePlay className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg hover:shadow-secondary/5 transition-all duration-300 overflow-hidden bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="w-16 h-16 bg-gradient-to-br from-secondary to-sky-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-105 transition-transform shadow-lg shadow-secondary/20">
              <Icons.monitor className="w-8 h-8 text-secondary-foreground" />
            </div>
            <CardTitle className="text-2xl md:text-3xl">Watch Stream</CardTitle>
            <CardDescription className="text-base">
              View the live stream as a spectator without joining as a participant
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-secondary/20 flex items-center justify-center mt-0.5">
                  <Icons.play className="w-3 h-3 text-secondary" />
                </div>
                <p className="text-sm text-muted-foreground">High-definition video streaming</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-secondary/20 flex items-center justify-center mt-0.5">
                  <Icons.volume2 className="w-3 h-3 text-secondary" />
                </div>
                <p className="text-sm text-muted-foreground">Immersive audio experience</p>
              </div>
            </div>
            <Button asChild variant="secondary" className="w-full mt-8 group-hover:bg-secondary/90 group-hover:scale-[1.02] transition-all" size="lg">
              <Link href="/watch" className="flex items-center gap-2">
                Watch Live
                <Icons.play className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      
      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl w-full mb-16 mt-8">
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent">99.9%</h4>
          <p className="text-sm text-muted-foreground mt-1">Uptime</p>
        </div>
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent">300ms</h4>
          <p className="text-sm text-muted-foreground mt-1">Latency</p>
        </div>
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent">5K+</h4>
          <p className="text-sm text-muted-foreground mt-1">Active Users</p>
        </div>
        <div className="text-center">
          <h4 className="text-3xl md:text-4xl font-bold bg-gradient-to-br from-primary to-purple-400 bg-clip-text text-transparent">4.8/5</h4>
          <p className="text-sm text-muted-foreground mt-1">User Rating</p>
        </div>
      </div>
    </main>
    <Footer />
  </div>
  )
}
