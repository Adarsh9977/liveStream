"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { Icons } from "@/components/ui/icons"

type TrackedPC = {
  peerConnection: RTCPeerConnection;
  pendingCandidates: RTCIceCandidate[];
  remoteDescSet: boolean;
};


export default function StreamRoom() {
  const [isConnected, setIsConnected] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [peers, setPeers] = useState<string[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [pendingPeers, setPendingPeers] = useState<string[]>([])
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const peerConnections = useRef<Map<string, TrackedPC>>(new Map());
  const ws = useRef<WebSocket | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const remoteStreams = useRef<Map<string, MediaStream>>(new Map());
  const [, forceUpdate] = useState({})
  const adminId = useRef<string | null>(null)
  const clientIdRef = useRef<string | null>(null)
  const isRoomLocked = useRef(false)


  useEffect(() => {
    ws.current = new WebSocket("ws://localhost:3001")

    ws.current.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      switch (message.type) {
        case "join-accepted": {
          const { peerId, roomId: acceptedRoomId } = message;
          clientIdRef.current = peerId
          setRoomId(acceptedRoomId);
          setIsConnected(true);
          toast.success("Your join request was accepted");

          // Request router RTP capabilities to start mediasoup setup
          ws.current?.send(JSON.stringify({
            type: "get-router-capabilities",
            roomId: acceptedRoomId
          }));
          break;
        }
        case "join-rejected": {
          setPendingPeers([])
          setIsConnected(false)
          toast.error("Your join request was rejected")
          break
        }
        case "room-closed": {
          // Clean up all connections and state
          cleanupConnections()
          setIsConnected(false)
          setIsAdmin(false)
          setPeers([])
          setPendingPeers([])
          setRoomId('')
          setRoomCode('')
          adminId.current = null
          isRoomLocked.current = false
          toast.info("The room was closed by the admin")
          break
        }
        case "room-created": {
          const { roomId: createdRoomId, rtpCapabilities, adminId: newAdminId, isAdmin: isAdminResponse } = message

          setRoomId(createdRoomId)
          setIsConnected(true)
          setIsAdmin(isAdminResponse)

          if (isAdminResponse) {
            adminId.current = newAdminId
            clientIdRef.current = newAdminId
            toast.success("Room created successfully", {
              description: `Share this code with others: ${roomCode}`,
              duration: 5000
            })
          } else {
            toast.success("Joined room successfully")
          }
          break
        }
        case "room-locked": {
          isRoomLocked.current = true
          if (!isAdmin) {
            toast.info("Room is now managed by another admin")
          }
          break
        }
        case "room-unlocked": {
          isRoomLocked.current = false
          break
        }
        case "offer":
        case "answer":
        case "ice-candidate": {
          const { sourceId,targetId, roomId } = message
          // Handle signaling messages...
          if (message.type === "offer") await handleOffer({ sourceId, offer: message.offer, targetId, roomId })
          else if (message.type === "answer") await handleAnswer({ sourceId, targetId, answer: message.answer, roomId})
          else await handleIceCandidate({ sourceId, targetId, candidate: message.candidate })
          break
        }
        case "participant-joined":
          await handleParticipantJoined({participantId: message.participantId, roomId: message.roomId})
          break
        case "participant-request": {
          const { participantId } = message
          console.log("Participant request received:", participantId, isAdmin)
          await handleParticipantRequest({ participantId })
          break
        }
        case "participant-left":
          handleParticipantLeft({ participantId: message.participantId })
          break
        case "join-room-error": {
          const { error } = message
          toast.error(error || "Invalid room code")
          break
        }
        case "accept-peer-success": {
          const { participantId, roomId } = message;
          console.log("Accepted peer", participantId, roomId)
          handleParticipantJoined({ participantId, roomId });
          setPendingPeers(prev => prev.filter(id => id !== participantId));
          toast.success(`Peer ${participantId} accepted successfully`);
          break;
        }
      }
    }

    return () => cleanupConnections()
  }, [])
  
  const cleanupConnections = () => {

    // Clean up WebRTC connections
    peerConnections.current.forEach(connection => connection.peerConnection.close())
    
    // Clean up media streams
    localStream.current?.getTracks().forEach(track => track.stop())
    remoteStreams.current.forEach(stream => {
      stream.getTracks().forEach(track => track.stop())
    })

    peerConnections.current.clear()
    remoteStreams.current.clear()
    remoteVideoRefs.current.clear()

    // Close WebSocket connection
    if (ws.current) {
      ws.current.close()
      ws.current = null
    }
  }


  const generateRoomCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    setRoomCode(code)
    return code
  }

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStream.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
    } catch (error) {
      console.error("Error accessing media devices:", error)
    }
  }

  const createPeerConnection = (peerId: string, roomId: string): RTCPeerConnection => {
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ],
      })
      
      const tracked: TrackedPC = {
        peerConnection,
        pendingCandidates: [],
        remoteDescSet: false,
      };
      peerConnections.current.set(peerId, tracked);
  
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current?.send(
            JSON.stringify({
              type: "ice-candidate",
              targetId: peerId,
              sourceId: clientIdRef.current,
              roomId,
              candidate: event.candidate,
            })
          )
        }
      }
  
      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state for peer ${peerId}:`, peerConnection.connectionState);
      }
  
      peerConnection.ontrack = (event) => {
          console.log(`Received track from peer ${peerId}:`, event.streams);
          const [stream] = event.streams;
          if (!stream) {
              console.error('No stream received in ontrack');
              return;
          }
          remoteStreams.current.set(peerId, stream);
      }
  
    localStream.current?.getTracks().forEach((track) => {
      console.log('Adding track to peer connection:', track.kind);
      try {
        peerConnection.addTrack(track, localStream.current!);
      } catch (error) {
        console.error('Error adding track:', error);
      }
    })
  
    return peerConnection
  }

  async function setRemoteDesc(peerId: string, desc: RTCSessionDescriptionInit) {
    const tracked = peerConnections.current.get(peerId);
    if (!tracked) throw new Error("No RTCPeerConnection for " + peerId);

    await tracked.peerConnection.setRemoteDescription(desc);
    // Mark that we can now add any queued ICE candidates
    tracked.remoteDescSet = true;
    for (const c of tracked.pendingCandidates) {
      await tracked.peerConnection.addIceCandidate(c);
    }
    tracked.pendingCandidates.length = 0;
  }

  const handleOffer = async ({ sourceId, offer, targetId, roomId }: any) => {
    const peerConnection = createPeerConnection(sourceId, roomId)

    if (peerConnection.signalingState !== 'stable') {
      console.warn('Cannot set remote offer, wrong state:', peerConnection.signalingState);
      return;
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer);

    ws.current?.send(
      JSON.stringify({
        type: "answer",
        sourceId: clientIdRef.current,
        targetId: sourceId,
        roomId,
        answer,
      })
    )

    setPeers((prev) => [...prev, sourceId]);
  }

  const handleAnswer = async ({ sourceId, targetId, answer, roomId }: any) => {
    if (targetId !== clientIdRef.current) return;
  
    const tracked = peerConnections.current.get(sourceId);
  
    if (!tracked) {
      console.error("Peer connection not found for:", sourceId);
      return;
    }
  
    if (tracked.peerConnection.signalingState !== 'have-local-offer') {
      console.warn("Skipping answer, invalid signaling state:", tracked.peerConnection.signalingState);
      return;
    }
  
    try {
      await setRemoteDesc(sourceId, answer);
      console.log("Remote answer set successfully for:", sourceId);
      setPeers((prev) => [...new Set([...prev, sourceId])]);
    } catch (err) {
      console.error("Failed to set remote answer:", err);
    }
  };
  

  const handleIceCandidate = async ({ sourceId, targetId, candidate,}: { sourceId: string; targetId: string; candidate: RTCIceCandidateInit;}) => {
    if (targetId !== clientIdRef.current) return;

    const tracked = peerConnections.current.get(sourceId);
    if (!tracked) {
      console.warn("No connection found for sourceId:", sourceId);
      return;
    }

    const iceCandidate = new RTCIceCandidate(candidate);

    if (!tracked.remoteDescSet) {
      // Queue it
      tracked.pendingCandidates.push(iceCandidate);
      console.log("Queued ICE candidate until remote description is set");
    } else {
      try {
        console.log("Adding ICE candidate immediately");
        await tracked.peerConnection.addIceCandidate(iceCandidate);
      } catch (err) {
        console.error("Failed to add ICE candidate:", err);
      }
    }
  }

  const handleParticipantJoined = async ({ participantId, roomId } : { participantId: string, roomId: string }) => {
    const peerConnection = createPeerConnection(participantId, roomId)
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    console.log("Room ID", roomId)
    ws.current?.send(
      JSON.stringify({
        type: "offer",
        targetId: participantId,
        sourceId: clientIdRef.current,
        roomId: roomId,
        offer,
      })
    );
  }

  const handleParticipantLeft = ({ participantId }: any) => {
    // Clean up peer connection
    const peerConnection = peerConnections.current.get(participantId);
    if (peerConnection) {
    // Stop all tracks from this peer
    peerConnection.peerConnection.getSenders().forEach(sender => {
      if (sender.track) {
        sender.track.stop();
      }
    });
    peerConnection.peerConnection.getReceivers().forEach(receiver => {
      if (receiver.track) {
        receiver.track.stop();
      }
    });
      
      // Close and remove the peer connection
      peerConnection.peerConnection.close();
      peerConnections.current.delete(participantId);
    }
  
    // Clean up remote stream
    const remoteStream = remoteStreams.current.get(participantId);
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        track.stop();
      });
      remoteStreams.current.delete(participantId);
    }
  
    // Clean up video element reference
    const videoElement = remoteVideoRefs.current.get(participantId);
    if (videoElement) {
      videoElement.srcObject = null;
      remoteVideoRefs.current.delete(participantId);
    }

    // Update peers list
    setPeers(prev => prev.filter(id => id !== participantId));
  
    // Notify about participant leaving
    toast.info(`Participant ${participantId.substring(0, 6)} left the room`);
  };

  const handleStartStream = async () => {
    try {
      await startLocalStream()
    } catch (error) {
      console.error("Error starting local stream:", error)
    }
  }

  const handleJoinRoom = async () => {
    try {
      if (!localStream.current) {
        toast.error("Please start your camera first")
        return
      }

      // Determine if this is a new room or joining existing
      const isNewRoom = !roomCode
      const generatedRoomCode = isNewRoom ? generateRoomCode() : roomCode


      // Send join room request
      ws.current?.send(JSON.stringify({
        type: 'join-room',
        roomId,
        roomCode: generatedRoomCode,
        isAdmin: isNewRoom
      }))

      if (isNewRoom) {
        setRoomCode(generatedRoomCode)
      }
    } catch (error) {
      toast.error("Failed to join room")
      console.error(error)
    }
  }

  const handlePeer = async (action: 'accept' | 'reject', participantId: string) => {
    if (!isAdmin || isRoomLocked.current) {
      toast.error("You don't have admin privileges")
      return
    }

    ws.current?.send(JSON.stringify({
      type: action === 'accept' ? 'accept-peer' : 'reject-peer',
      roomId,
      targetId: participantId,
      adminId: clientIdRef.current
    }))
  }

  const handleParticipantRequest = async ({ participantId }: any) => {
    console.log("isAdmin", isAdmin)
    console.log("Received participant request:", participantId, isAdmin)
      setPendingPeers(prev => [...prev, participantId])
      toast("New participant request", {
        description: `Participant ${participantId} wants to join the room`,
        action: {
          label: "Add",
          onClick: async () => {
            try {
              // Accept the peer
              await handlePeer( 'accept', participantId)
              // Create consumer transport for the new peer
              ws.current?.send(JSON.stringify({
                type: "create-consumer-transport",
                roomId,
                participantId
              }))
              toast.success("Participant added successfully")
            } catch (error) {
              console.error("Failed to add participant:", error)
              toast.error("Failed to add participant")
            }
          }
        },
        duration: 10000
      })
  }

  const handleLeaveRoom = async () => {
    // Notify server about leaving
    ws.current?.send(JSON.stringify({ 
      type: "leave-room",
      roomId,
      peerId: clientIdRef.current 
    }));

    // Stop all local tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        track.stop();
      });
      localStream.current = null;
    }

    // Clear local video element
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  
    // Stop and clear all remote streams
    remoteStreams.current.forEach(stream => {
      stream.getTracks().forEach(track => track.stop());
    });
    remoteStreams.current.clear();
  
    // Close all peer connections
    peerConnections.current.forEach(connection => {
      connection.peerConnection.close();
    });
    peerConnections.current.clear();
  
    // Reset all states
    setIsConnected(false);
    setIsAdmin(false);
    setPeers([]);
    setPendingPeers([]);
    setRoomId('');
    setRoomCode('');
    setIsMuted(false);
    setIsVideoOff(false);
    
    // Reset refs
    adminId.current = null;
    clientIdRef.current = null;
    isRoomLocked.current = false;
  };

  const handleToggleMute = () => {
    if (localStream.current) {
      const audioTracks = localStream.current.getAudioTracks()
      audioTracks.forEach(track => {
        track.enabled = isMuted ? true : false
      })
      setIsMuted(!isMuted)
    }
  }

  const handleToggleVideo = async () => {
    if (!localStream.current) return;
  
    // Determine the new "on/off" state
    const willEnable = isVideoOff; // if video is off, we will enable
    let newTrack: MediaStreamTrack | null = null;
  
    if (willEnable) {
      // 🔄 Turn camera back ON
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        newTrack = newStream.getVideoTracks()[0];
  
        // Swap tracks in each RTCPeerConnection
        peerConnections.current.forEach(({ peerConnection }) => {
          const sender = peerConnection
            .getSenders()
            .find(s => s.track?.kind === "video");
          if (sender && newTrack) {
            sender.replaceTrack(newTrack);
          }
        });
  
        // Remove any old video track, add the new one
        const oldVideoTrack = localStream.current
          .getVideoTracks()[0];
        if (oldVideoTrack) {
          oldVideoTrack.stop();
          localStream.current.removeTrack(oldVideoTrack);
        }
        if (newTrack) {
          localStream.current.addTrack(newTrack);
        }
      } catch (err) {
        console.error("Failed to restart video:", err);
        toast.error("Failed to restart camera");
        return;
      }
    } else {
      // 🛑 Turn camera OFF completely
      localStream.current.getVideoTracks().forEach(track => {
        track.enabled = false;
        setTimeout(() => {
          track.stop();
        }, 5);
        localStream.current?.removeTrack(track);
      });
    }

    // Flip state and notify peers of the *new* enabled value
    setIsVideoOff(!isVideoOff);
  };
  
  return (
    <div className="container max-w-7xl mx-auto px-4 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 border-2 border-border/50 bg-card/90 backdrop-blur-sm shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icons.video className="h-5 w-5" />
              <span>Video Stream</span>
              {isConnected && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Live</span>}
            </CardTitle>
            <CardDescription>Room: {roomId}</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Local video with controls overlay */}
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video group">
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`w-full h-full object-cover ${isVideoOff ? 'opacity-0' : 'opacity-100'}`} 
                />

                {/* Video controls overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 rounded-full bg-background/20 text-white hover:bg-background/40"
                        onClick={handleToggleMute}
                      >
                        {isMuted ? <Icons.micOff className="h-4 w-4" /> : <Icons.mic className="h-4 w-4" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full bg-background/20 text-white hover:bg-background/40"
                        onClick={handleToggleVideo}
                      >
                        { isVideoOff  ? <Icons.cameraOff className="h-4 w-4" /> : <Icons.camera className="h-4 w-4" /> }
                      </Button>
                    </div>

                    <span className="bg-primary/90 px-2 py-0.5 rounded text-xs font-medium text-primary-foreground">
                      You (Local)
                    </span>
                  </div>
                </div>
              </div>

              {/* Remote peers */}
              {Array.from(remoteStreams.current.keys()).map((peerId) => (
                <div key={peerId} className="relative bg-black rounded-lg overflow-hidden aspect-video group shadow-md">
                    <video
                        key={peerId}
                        ref={(el) => {
                            if (el) {
                                const stream = remoteStreams.current.get(peerId);
                                el.srcObject = stream || null;
                                remoteVideoRefs.current.set(peerId, el);
                                if (stream){
                                  setTimeout(() => {
                                    el.play().catch(console.error);
                                  }, 0);
                                }
                            }
                        }}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />

                  {/* Peer video controls overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full bg-background/20 text-white hover:bg-background/40"
                        >
                          {false ? <Icons.volumeX className="h-4 w-4" /> : <Icons.volume1 className="h-4 w-4" />}
                        </Button>
                      </div>

                      <span className="bg-secondary/90 px-2 py-0.5 rounded text-xs font-medium text-secondary-foreground">
                        Peer {peerId.substring(0, 6)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Placeholder for empty slots */}
              {peers.length === 0 && isConnected && (
                <div className="bg-gray-900/50 rounded-lg overflow-hidden aspect-video flex flex-col items-center justify-center space-y-3 border border-dashed border-gray-700">
                  <Icons.monitor className="w-12 h-12 text-gray-500 opacity-50" />
                  <p className="text-gray-400 text-sm">Waiting for other peers to join...</p>
                  <Progress value={25} className="w-24 h-1" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border/50 bg-card/90 backdrop-blur-sm shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Icons.circlePlay className="h-5 w-5" />
              Stream Controls
            </CardTitle>
            <CardDescription>
              Manage your stream settings and connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="room-id">Room ID</Label>
              <div className="flex gap-2">
                <Input
                  id="room-id"
                  type="text"
                  value={roomId ? roomId : ""}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="flex-1"
                  disabled={isConnected}
                  placeholder="Enter room identifier"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                You'll join other participants in this room
              </p>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              {!localStream.current && (
                <Button
                  onClick={handleStartStream}
                  className="col-span-2 gap-2"
                  variant="outline"
                >
                  <Icons.camera className="h-4 w-4" />
                  Start Camera
                </Button>
              )}

              {!isConnected && (
                <Button onClick={handleJoinRoom} className="col-span-2 gap-2">
                  <Icons.logIn className="h-4 w-4" />
                  Join Stream
                </Button>
              )}

              {isConnected && (
                <Button onClick={handleLeaveRoom} variant="destructive" className="col-span-2 gap-2">
                  <Icons.logOut className="h-4 w-4" />
                  Leave Stream
                </Button>
              )}

              {localStream.current && (
                <>
                  <Button 
                    onClick={handleToggleMute} 
                    variant={isMuted ? "secondary" : "outline"}
                    className="gap-2"
                  >
                    {isMuted ? <Icons.micOff className="h-4 w-4" /> : <Icons.mic className="h-4 w-4" />}
                    {isMuted ? "Unmute" : "Mute"}
                  </Button>
                  
                  <Button 
                    onClick={handleToggleVideo}
                    variant={isVideoOff ? "secondary" : "outline"}
                    className="gap-2"
                  >
                    <Icons.camera className="h-4 w-4" />
                    {isVideoOff ? "Show Video" : "Hide Video"}
                  </Button>
                </>
              )}
            </div>

            <Separator />


            <div className="space-y-3">
              <Label>Room Code</Label>
              <div className="flex items-center gap-2 p-2 bg-secondary/30 rounded">
                <input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} className="text-sm font-mono" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => navigator.clipboard.writeText(roomCode)}
                >
                  <Icons.copy className="h-4 w-4" />
                </Button>
              </div>
              
              {pendingPeers.length > 0 && (
                <div className="space-y-2">
                  <Label>Pending Requests</Label>
                  {pendingPeers.map(peerId => (
                    <div key={peerId} className="flex items-center justify-between p-2 bg-secondary/30 rounded">
                      <span className="text-sm">Peer {peerId.substring(0, 6)}</span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePeer( 'accept', peerId)}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handlePeer( 'reject', peerId)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="font-medium mb-3">Connection Status</h3>
              <div className="space-y-2 rounded-md bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Server Connection</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></div>
                    <span className="text-xs font-medium">
                      {isConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Room Status</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></div>
                    <span className="text-xs font-medium">
                      {isConnected ? "Joined" : "Not in room"}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm">Peers</span>
                  <span className="text-xs font-medium bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                    {peers.length} online
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
