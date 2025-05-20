
"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Icons } from "@/components/ui/icons"
import { cn } from "@/lib/utils"
import { useWebSocket } from "@/hooks/use-socket"

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [viewerCount, setViewerCount] = useState(0)
  const { socket, isConnected } = useWebSocket()

  useEffect(() => {
    if (socket && isConnected) {
      // Send join event
      socket.send(JSON.stringify({ type: "join-viewers" }))

      // Handle messages
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "viewer-count") {
            setViewerCount(data.count)
          }
        } catch (err) {
          console.error("Failed to parse WebSocket message:", err)
        }
      }
  
      socket.addEventListener("message", handleMessage)
  
      // Cleanup
      return () => {
        socket.send(JSON.stringify({ type: "leave-viewers" }))
        socket.removeEventListener("message", handleMessage)
      }
    }
  }, [socket, isConnected])
  

  useEffect(() => {
    const videoElement = videoRef.current

    if (videoElement) {
      const handleCanPlay = () => {
        setIsLoading(false)
      }

      const handlePlay = () => {
        setIsPlaying(true)
      }

      const handlePause = () => {
        setIsPlaying(false)
      }

      const handleError = (e: Event) => {
        console.error("Video playback error:", e)
        setIsLoading(false)
      }

      videoElement.addEventListener("canplay", handleCanPlay)
      videoElement.addEventListener("play", handlePlay)
      videoElement.addEventListener("pause", handlePause)
      videoElement.addEventListener("error", handleError)

      // Set the HLS source
      videoElement.src = "/api/hls/stream.m3u8"

      return () => {
        videoElement.removeEventListener("canplay", handleCanPlay)
        videoElement.removeEventListener("play", handlePlay)
        videoElement.removeEventListener("pause", handlePause)
        videoElement.removeEventListener("error", handleError)
      }
    }
  }, [])

  // Handle controls visibility
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);

      timeout = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    const container = videoContainerRef.current;
    if (container) {
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseenter", handleMouseMove);
      container.addEventListener("mouseleave", () => {
        if (isPlaying) {
          setShowControls(false);
        }
      });
    }

    return () => {
      clearTimeout(timeout);
      if (container) {
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseenter", handleMouseMove);
        container.removeEventListener("mouseleave", () => {});
      }
    };
  }, [isPlaying]);

  const handlePlayPause = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  }

  const handleMuteToggle = () => {
    const video = videoRef.current
    if (!video) return

    video.muted = !video.muted
    setIsMuted(video.muted)
  }

  const toggleFullscreen = () => {
    const container = videoContainerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="overflow-hidden border border-border/50 bg-card/80 backdrop-blur-sm">
        <div
          ref={videoContainerRef}
          className="relative bg-black aspect-video group cursor-pointer"
          onClick={(e) => {
            // Don't trigger when clicking controls
            if ((e.target as HTMLElement).closest('.video-controls')) return;
            handlePlayPause();
          }}
        >
          {/* Video Element */}
          <video
            ref={videoRef}
            playsInline
            className="w-full h-full"
          />

          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-gray-500/30"></div>
                <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>
              </div>
            </div>
          )}

          {/* Live Indicator */}
          <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/70 pl-2 pr-3 py-1 rounded-full z-20 backdrop-blur-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-white text-xs font-medium">LIVE</span>
          </div>

          {/* Viewers Count */}
          <div className="absolute top-4 right-4 bg-black/70 px-3 py-1 rounded-full z-20 backdrop-blur-sm">
            <div className="flex items-center space-x-1.5">
              <Icons.circlePlay className="w-3.5 h-3.5 text-gray-300" />
              <span className="text-white text-xs font-medium">{viewerCount}</span>
            </div>
          </div>

          {/* Custom Video Controls */}
          <div 
            className={cn(
              "absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-20 transition-opacity duration-300 video-controls",
              showControls ? "opacity-100" : "opacity-0"
            )}
          >
            {/* Progress Bar (visual only, not functional in this version) */}
            <div className="w-full h-1 bg-gray-600 rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-primary w-[60%] rounded-full"></div>
            </div>
            
            <div className="flex items-center justify-between">
              {/* Left Controls */}
              <div className="flex items-center space-x-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white hover:bg-white/10 rounded-full"
                  onClick={handlePlayPause}
                >
                  {isPlaying ? <Icons.pause className="h-5 w-5" /> : <Icons.play className="h-5 w-5" />}
                </Button>
                
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-white hover:bg-white/10 rounded-full"
                  onClick={handleMuteToggle}
                >
                  {isMuted ? <Icons.volumeX className="h-5 w-5" /> : <Icons.volume2 className="h-5 w-5" />}
                </Button>
              </div>
              
              {/* Center area */}
              <div className="flex-1"></div>
              
              {/* Right Controls */}
              <div className="flex items-center space-x-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white hover:bg-white/10 rounded-full"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Icons.skipBack className="h-5 w-5 rotate-90" /> : <Icons.fullscreen className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Big Play Button (Shown only when paused) */}
          {!isPlaying && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-16 h-16 rounded-full bg-primary/30 backdrop-blur-sm hover:bg-primary/50 text-white"
                onClick={handlePlayPause}
              >
                <Icons.play className="h-8 w-8" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Video Info */}
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold tracking-tight">Live Stream</h2>
              <div className="flex items-center space-x-2 text-muted-foreground">
                <div className="flex items-center">
                  <Icons.circlePlay className="w-4 h-4 mr-1.5 text-primary" />
                  <span>{viewerCount} viewer{viewerCount !== 1 ? 's' : ''}</span>
                </div>
                <span>•</span>
                <span>Started 45 minutes ago</span>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button className="gap-1.5" onClick={handlePlayPause}>
                {isPlaying ? (
                  <>
                    <Icons.pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Icons.play className="h-4 w-4" />
                    Play
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-3">About This Stream</h3>
          <p className="text-muted-foreground leading-relaxed">
            This is a live HLS stream that's being generated from WebRTC peers in the /stream room. 
            The stream is processed through our SFU (Selective Forwarding Unit) and converted to HLS format for broader distribution.
            Enjoy high-quality, low-latency video streaming powered by our cutting-edge WebRTC platform.
          </p>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {/* Stream Stats Cards */}
            <div className="bg-muted/50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">99.9%</div>
              <div className="text-xs text-muted-foreground">Uptime</div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">300ms</div>
              <div className="text-xs text-muted-foreground">Latency</div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">720p</div>
              <div className="text-xs text-muted-foreground">Quality</div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">HLS</div>
              <div className="text-xs text-muted-foreground">Format</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}