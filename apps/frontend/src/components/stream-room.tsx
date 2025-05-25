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
import { Video, Users, Plus, LogIn } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [name, setName] = useState('');
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
  const isRoomLocked = useRef(false);
  const [activeTab, setActiveTab] = useState("create");


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
          await startLocalStream();
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
          setPeers([])
          setPendingPeers([])
          setRoomId('')
          setRoomCode('')
          isRoomLocked.current = false
          toast.info("The room was closed by the admin")
          break
        }
        case "room-created": {
          const { roomId: createdRoomId, adminId: newAdminId, name, roomCode } = message

          setRoomId(createdRoomId)
          setIsConnected(true)
          setRoomCode(roomCode)


          clientIdRef.current = newAdminId
          toast.success("Room created successfully", {
            description: `Share this code with others: ${roomCode}`,
            duration: 5000
          })
          await startLocalStream();
          break
        }
        case "room-locked": {
          isRoomLocked.current = true
            toast.info("Room is now managed by another admin")
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
          await handleParticipantJoined({participantId: message.participantId, roomId: message.roomId, name: message.name})
          break
        case "participant-request": {
          const { participantId, name } = message
          await handleParticipantRequest({ participantId, name })
          break
        }
        case "participant-left":
          handleParticipantLeft({ participantId: message.participantId, name: message.name })
          break
        case "join-room-error": {
          const { error } = message
          toast.error(error || "Invalid room code")
          break
        }
        case "accept-peer-success": {
          const { participantId, roomId, name } = message;
          console.log("Accepted peer", participantId, roomId)
          handleParticipantJoined({ participantId, roomId, name: message.name });
          setPendingPeers(prev => prev.filter(id => id !== participantId));
          toast.success(`${name} accepted successfully`);
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

  const handleParticipantJoined = async ({ participantId, roomId } : { participantId: string, roomId: string, name: string }) => {
    const peerConnection = createPeerConnection(participantId, roomId)
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    ws.current?.send(
      JSON.stringify({
        type: "offer",
        targetId: participantId,
        sourceId: clientIdRef.current,
        roomId: roomId,
        offer,
      })
    );
    toast.success(`${name} joined the room`)
  }

  const handleParticipantLeft = ({ participantId, name }: { participantId: string, name: string }) => {
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
    toast.info(`${name} left the room`);
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
      await startLocalStream();
      // Send join room request
      ws.current?.send(JSON.stringify({
        type: 'join-room',
        name,
        roomId,
        roomCode: roomCode,
        isAdmin: false
      }))
    } catch (error) {
      toast.error("Failed to join room")
      console.error(error)
    }
  }

  const createRoom = async () => {
    if (!name || !roomId) {
      !name ? toast.error("Please enter your name") : toast.error("Please enter a room name")
      return
    }
    await startLocalStream();

    try {
      await ws.current?.send(JSON.stringify({
        type: 'create-room',
        name,
        roomId,
      }))
    } catch (error) {
      toast.error("Failed to create room")
      console.error(error)
    }
  }

  const handlePeer = async (action: 'accept' | 'reject', participantId: string) => {

    ws.current?.send(JSON.stringify({
      type: action === 'accept' ? 'accept-peer' : 'reject-peer',
      roomId,
      targetId: participantId,
      adminId: clientIdRef.current
    }))
  }

  const handleParticipantRequest = async ({ participantId }: { participantId: string, name: string }) => {
    console.log("Received participant request:", participantId)
      setPendingPeers(prev => [...prev, participantId])
      // toast("New participant request", {
      //   description: `${name} wants to join the room`,
      //   action: {
      //     label: "Add",
      //     onClick: async () => {
      //       try {
      //         // Accept the peer
      //         await handlePeer( 'accept', participantId)
      //         // Create consumer transport for the new peer
      //         ws.current?.send(JSON.stringify({
      //           type: "create-consumer-transport",
      //           roomId,
      //           participantId
      //         }))
      //         toast.success("Participant added successfully")
      //       } catch (error) {
      //         console.error("Failed to add participant:", error)
      //         toast.error("Failed to add participant")
      //       }
      //     }
      //   },
      //   duration: 10000
      // })
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
        }, 0);
        localStream.current?.removeTrack(track);
      });
    }

    // Flip state and notify peers of the *new* enabled value
    setIsVideoOff(!isVideoOff);
  };
  
  return (
    <div className="container max-w-7xl mx-auto px-4 py-6">
      {!isConnected ? (<div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Icons.video className="h-8 w-8 text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-2">
          VideoChat
        </h1>
        <p className="text-gray-400">Connect with others through secure video calls</p>
      </div>

      <Card className="shadow-2xl border border-gray-800 bg-gray-900/80 backdrop-blur-sm hover:border-purple-500/50 transition-all duration-300">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl text-white">Get Started</CardTitle>
          <CardDescription className="text-gray-400">
            Create a new room or join an existing one
          </CardDescription>
        </CardHeader>
        
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-800 border-gray-700">
              <TabsTrigger 
                value="create" 
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white text-gray-300 hover:text-white transition-all"
              >
                <Icons.video className="h-4 w-4 mr-2" />
                Create
              </TabsTrigger>
              <TabsTrigger 
                value="join"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-blue-600 data-[state=active]:text-white text-gray-300 hover:text-white transition-all"
              >
                <Icons.video className="h-4 w-4 mr-2" />
                Join
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="create" className="mt-0">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="creator-name" className="text-sm font-medium text-gray-300">
                    Your Name
                  </Label>
                  <Input
                    id="creator-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="mt-1 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-400 focus:border-purple-500 hover:border-gray-600 transition-colors"
                  />
                </div>

                <div>
                  <Label htmlFor="room-name" className="text-sm font-medium text-gray-300">
                    Room Name
                  </Label>
                  <Input
                    id="room-name"
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    placeholder="e.g., Team Meeting, Study Group"
                    className="mt-1 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-400 focus:border-purple-500 hover:border-gray-600 transition-colors"
                  />
                </div>

                <Button
                  onClick={createRoom}
                  className="w-full h-10 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 transition-all"
                >
                  <Icons.circlePlay className="h-4 w-4 mr-2" /> 
                  Create Room
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="join" className="mt-0">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="joiner-name" className="text-sm font-medium text-gray-300">
                    Your Name
                  </Label>
                  <Input
                    id="joiner-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="mt-1 bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-400 focus:border-purple-500 hover:border-gray-600 transition-colors"
                  />
                </div>

                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 space-y-4">
                  <div>
                    <Label htmlFor="room-id" className="text-sm font-medium text-gray-300">
                      Room ID
                    </Label>
                    <Input
                      id="room-id"
                      type="text"
                      value={roomId}
                      onChange={(e) => setRoomId(e.target.value)}
                      placeholder="Enter room ID"
                      className="mt-1 bg-gray-800 border-gray-600 text-gray-100 placeholder:text-gray-400 focus:border-purple-500 hover:border-gray-500 transition-colors"
                    />
                  </div>

                  <div>
                    <Label htmlFor="room-code" className="text-sm font-medium text-gray-300">
                      Room Code (6 digits)
                    </Label>
                    <Input
                      id="room-code"
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="Enter 6-letter code"
                      className="mt-1 font-mono text-center text-lg tracking-wider bg-gray-800 border-gray-600 text-gray-100 placeholder:text-gray-400 focus:border-purple-500 hover:border-gray-500 transition-colors"
                      maxLength={6}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleJoinRoom}
                  className="w-full h-10 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all"
                >
                  <Icons.play className="h-4 w-4 mr-2" />
                  Join Room
                </Button>

                <div className="text-center">
                  <p className="text-xs text-gray-500">
                    Both Room ID and Room Code are required to join
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="text-center mt-6 text-sm text-gray-500">
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Secure • Private • Easy to use
        </div>
      </div>
    </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 border-gray-800 bg-gray-900/80 backdrop-blur-sm shadow-2xl pt-0 hover:border-purple-500/30 transition-all duration-300">
          <CardHeader className="py-4 bg-gradient-to-r from-gray-900/90 to-gray-800/90 rounded-t-lg border-b border-gray-700/50">
            <CardTitle className="flex items-center gap-3 text-xl text-white">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Icons.video className="h-5 w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Video Stream</span>
              {isConnected && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-900/60 text-green-300 border border-green-700/50 shadow-lg backdrop-blur-sm">
                  <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse shadow-sm shadow-green-400/50"></div>
                  Live
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-gray-400 ml-13">Room: {roomId || "Not connected"}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 bg-gray-900/40 backdrop-blur-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="relative bg-gradient-to-br from-gray-900 to-gray-800/80 rounded-xl overflow-hidden aspect-video group border border-gray-700/50 shadow-xl hover:shadow-2xl hover:border-purple-500/30 transition-all duration-300">
                <video 
                  ref={localVideoRef}
                  autoPlay 
                  playsInline 
                  muted 
                  className={`w-full h-full object-cover transition-opacity duration-300 ${isVideoOff ? 'opacity-0' : 'opacity-100'}`} 
                />

                {isVideoOff && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-gradient-to-br from-gray-700 to-gray-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <Icons.camera className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="text-gray-400 text-sm font-medium">Camera is off</p>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className={`h-10 w-10 rounded-full text-white border backdrop-blur-sm transition-all duration-200 shadow-lg ${
                          isMuted 
                            ? 'bg-red-600/80 hover:bg-red-500/90 border-red-500/50 shadow-red-500/20' 
                            : 'bg-gray-800/60 hover:bg-gray-700/80 border-gray-600/50'
                        }`}
                        onClick={handleToggleMute}
                      >
                        {isMuted ? <Icons.mic className="h-4 w-4" /> : <Icons.mic className="h-4 w-4" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-10 w-10 rounded-full text-white border backdrop-blur-sm transition-all duration-200 shadow-lg ${
                          isVideoOff 
                            ? 'bg-red-600/80 hover:bg-red-500/90 border-red-500/50 shadow-red-500/20' 
                            : 'bg-gray-800/60 hover:bg-gray-700/80 border-gray-600/50'
                        }`}
                        onClick={handleToggleVideo}
                      >
                        {isVideoOff ? <Icons.camera className="h-4 w-4" /> : <Icons.camera className="h-4 w-4" />}
                      </Button>
                    </div>

                    <span className="bg-gradient-to-r from-purple-600/80 to-blue-600/80 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-medium text-white border border-purple-500/30 shadow-lg">
                      You (Local)
                    </span>
                  </div>
                </div>
              </div>

              {Array.from(remoteStreams.current.keys()).map((peerId) => (
                    <div key={peerId} className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video group shadow-lg border border-gray-700/50 hover:shadow-xl transition-shadow duration-300">
                      <video
                        key={peerId}
                        ref={(el) => {
                          if (el) {
                            const stream = remoteStreams.current.get(peerId);
                            el.srcObject = stream || null;
                            remoteVideoRefs.current.set(peerId, el);
                              el.play().catch(console.error);
                          }
                        }}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />

                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full bg-gray-800/60 text-white hover:bg-gray-700/80 border border-gray-600/50 transition-all duration-200"
                            >
                              {false ? <Icons.volumeX className="h-4 w-4" /> : <Icons.volume1 className="h-4 w-4" />}
                            </Button>
                          </div>

                          <span className="bg-gray-700/90 px-2 py-0.5 rounded text-xs font-medium text-gray-200 border border-gray-600/50 shadow-sm">
                            Peer {peerId.substring(0, 6)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

              {peers.length === 0 && (
                <div className="bg-gradient-to-br from-gray-900/70 to-gray-800/50 rounded-xl overflow-hidden aspect-video flex flex-col items-center justify-center space-y-4 border border-dashed border-gray-600/50 hover:border-purple-500/30 transition-all duration-300 backdrop-blur-sm">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-700 to-gray-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <Icons.monitor className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-400 text-sm text-center font-medium">Waiting for other peers to join...</p>
                  <Progress value={25} className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-600 to-blue-600 transition-all duration-300 rounded-full"></div>
                  </Progress>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-800 bg-gray-900/80 backdrop-blur-sm shadow-2xl pt-0 hover:border-purple-500/30 transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-gray-900/90 to-gray-800/90 rounded-t-lg py-4 border-b border-gray-700/50">
            <CardTitle className="text-xl flex items-center gap-3 text-white">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Icons.circlePlay className="h-5 w-5 text-white" />
              </div>
              <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">Stream Controls</span>
            </CardTitle>
            <CardDescription className="text-gray-400 ml-13">
              Manage your stream settings and connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 bg-gray-900/40 backdrop-blur-sm p-6">
            <div className="space-y-3">
              <Label htmlFor="room-id" className="text-gray-300 font-medium">Room ID</Label>
              <div className="flex gap-2">
                <Input
                  id="room-id"
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="flex-1 bg-gray-800/80 border-gray-700 text-gray-100 placeholder:text-gray-400 focus:border-purple-500 focus:ring-purple-500/20 hover:border-gray-600 transition-colors"
                  disabled={isConnected}
                  placeholder="Enter room identifier"
                />
              </div>
              <p className="text-xs text-gray-500">
                You'll join other participants in this room
              </p>
            </div>

            <Separator className="bg-gray-700/50" />

            <div className="grid grid-cols-2 gap-3">

              <Button
                onClick={handleLeaveRoom}
                variant="destructive"
                className="col-span-2 gap-2 bg-red-900/80 hover:bg-red-800/80 border border-red-800/50 hover:border-red-700/50 shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Icons.x className="h-4 w-4" />
                Leave Stream
              </Button>

              <Button
                onClick={handleToggleMute}
                variant={isMuted ? "secondary" : "outline"}
                className={`gap-2 transition-all duration-200 ${
                  isMuted 
                    ? 'bg-red-900/80 hover:bg-red-800/80 text-red-100 border-red-800/50' 
                    : 'bg-gray-800/50 hover:bg-gray-700 text-gray-100 border-gray-700'
                }`}
              >
                {isMuted ? <Icons.mic className="h-4 w-4" /> : <Icons.mic className="h-4 w-4" />}
                {isMuted ? "Unmute" : "Mute"}
              </Button>

              <Button
                onClick={handleToggleVideo}
                variant={isVideoOff ? "secondary" : "outline"}
                className={`gap-2 transition-all duration-200 ${
                  isVideoOff 
                    ? 'bg-red-900/80 hover:bg-red-800/80 text-red-100 border-red-800/50' 
                    : 'bg-gray-800/50 hover:bg-gray-700 text-gray-100 border-gray-700'
                }`}
              >
                <Icons.camera className="h-4 w-4" />
                {isVideoOff ? "Show Video" : "Hide Video"}
              </Button>
            </div>

            <Separator className="bg-gray-700/50" />

            <div className="space-y-3">
              <Label className="text-gray-300 font-medium">Room Code</Label>
              <div className="flex items-center gap-2 p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:bg-gray-800/70 transition-colors duration-200 backdrop-blur-sm">
                <input 
                  value={roomCode} 
                  onChange={(e) => setRoomCode(e.target.value)} 
                  className="text-sm font-mono bg-transparent text-gray-100 border-none outline-none flex-1 tracking-wider placeholder:text-gray-500" 
                  placeholder="Room code will appear here"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-all duration-200 rounded-lg"
                  onClick={() => navigator.clipboard.writeText(roomCode)}
                >
                  <Icons.copy className="h-4 w-4" />
                </Button>
              </div>
              
              {pendingPeers.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-gray-300 font-medium">Pending Requests</Label>
                  {pendingPeers.map(peerId => (
                    <div key={peerId} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 hover:bg-gray-800/70 transition-colors duration-200 backdrop-blur-sm">
                      <span className="text-sm text-gray-200 font-medium">Peer {peerId.substring(0, 6)}</span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-green-900/50 hover:bg-green-800/60 text-green-200 border-green-800/50 hover:border-green-700/50 transition-all duration-200"
                          onClick={() => handlePeer('accept', peerId)}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="bg-red-900/50 hover:bg-red-800/60 text-red-200 border-red-800/50 hover:border-red-700/50 transition-all duration-200"
                          onClick={() => handlePeer('reject', peerId)}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator className="bg-gray-700/50" />

            <div>
              <h3 className="font-medium mb-4 text-gray-200">Connection Status</h3>
              <div className="space-y-4 rounded-xl bg-gray-800/30 p-5 border border-gray-700/50 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300 font-medium">Server Connection</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse shadow-sm shadow-green-500/50" : "bg-red-500"}`}></div>
                    <span className="text-xs font-medium text-gray-300">
                      {isConnected ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300 font-medium">Room Status</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse shadow-sm shadow-green-500/50" : "bg-red-500"}`}></div>
                    <span className="text-xs font-medium text-gray-300">
                      {isConnected ? "Joined" : "Not in room"}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300 font-medium">Peers</span>
                  <span className="text-xs font-medium bg-gradient-to-r from-purple-600/60 to-blue-600/60 text-white px-3 py-1.5 rounded-full border border-purple-500/30 shadow-sm backdrop-blur-sm">
                    {peers.length} online
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  )
}




{/* <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="col-span-1 lg:col-span-2 border border-gray-700/50 bg-gray-800/90 backdrop-blur-sm shadow-xl pt-0">
              <CardHeader className="py-2 bg-gray-900/50 rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-xl text-gray-100">
                  <Icons.video className="h-5 w-5 text-slate-400" />
                  <span>Video Stream</span>
                  {isConnected && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/80 text-green-300 border border-green-800 shadow-sm">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5 animate-pulse"></div>
                      Live
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-gray-400">Room: {roomId}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 bg-gray-800/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video group border border-gray-700/50 shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <video 
                      ref={localVideoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className={`w-full h-full object-cover transition-opacity duration-300 ${isVideoOff ? 'opacity-0' : 'opacity-100'}`} 
                    />

                    {isVideoOff && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                        <div className="text-center">
                          <Icons.cameraOff className="h-12 w-12 text-gray-500 mx-auto mb-2" />
                          <p className="text-gray-400 text-sm">Camera is off</p>
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className={`h-8 w-8 rounded-full text-white border transition-all duration-200 ${
                              isMuted 
                                ? 'bg-red-600/80 hover:bg-red-500/90 border-red-500/50' 
                                : 'bg-gray-800/60 hover:bg-gray-700/80 border-gray-600/50'
                            }`}
                            onClick={handleToggleMute}
                          >
                            {isMuted ? <Icons.micOff className="h-4 w-4" /> : <Icons.mic className="h-4 w-4" />}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 rounded-full text-white border transition-all duration-200 ${
                              isVideoOff 
                                ? 'bg-red-600/80 hover:bg-red-500/90 border-red-500/50' 
                                : 'bg-gray-800/60 hover:bg-gray-700/80 border-gray-600/50'
                            }`}
                            onClick={handleToggleVideo}
                          >
                            {isVideoOff ? <Icons.cameraOff className="h-4 w-4" /> : <Icons.camera className="h-4 w-4" />}
                          </Button>
                        </div>

                        <span className="bg-slate-700/90 px-2 py-0.5 rounded text-xs font-medium text-slate-200 border border-slate-600/50 shadow-sm">
                          You (Local)
                        </span>
                      </div>
                    </div>
                  </div>

                  {Array.from(remoteStreams.current.keys()).map((peerId) => (
                    <div key={peerId} className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video group shadow-lg border border-gray-700/50 hover:shadow-xl transition-shadow duration-300">
                      <video
                        key={peerId}
                        ref={(el) => {
                          if (el) {
                            const stream = remoteStreams.current.get(peerId);
                            el.srcObject = stream || null;
                            remoteVideoRefs.current.set(peerId, el);
                              el.play().catch(console.error);
                          }
                        }}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />

                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full bg-gray-800/60 text-white hover:bg-gray-700/80 border border-gray-600/50 transition-all duration-200"
                            >
                              {false ? <Icons.volumeX className="h-4 w-4" /> : <Icons.volume1 className="h-4 w-4" />}
                            </Button>
                          </div>

                          <span className="bg-gray-700/90 px-2 py-0.5 rounded text-xs font-medium text-gray-200 border border-gray-600/50 shadow-sm">
                            Peer {peerId.substring(0, 6)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {peers.length === 0 && isConnected && (
                    <div className="bg-gray-900/70 rounded-lg overflow-hidden aspect-video flex flex-col items-center justify-center space-y-3 border border-dashed border-gray-600/50 hover:border-gray-500/50 transition-colors duration-300">
                      <Icons.monitor className="w-12 h-12 text-gray-500 opacity-50" />
                      <p className="text-gray-400 text-sm text-center">Waiting for other peers to join...</p>
                      <Progress value={25} className="w-24 h-1 bg-gray-800 [&>div]:bg-slate-600" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-700/50 bg-gray-800/90 backdrop-blur-sm shadow-xl pt-0">
              <CardHeader className="bg-gray-900/50 rounded-t-lg py-2">
                <CardTitle className="text-xl flex items-center gap-2 text-gray-100">
                  <Icons.circlePlay className="h-5 w-5 text-slate-400" />
                  Stream Controls
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Manage your stream settings and connection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 bg-gray-800/50">
                <div className="space-y-3">
                  <Label htmlFor="room-id" className="text-gray-300">Room ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="room-id"
                      type="text"
                      value={roomId ? roomId : ""}
                      onChange={(e) => setRoomId(e.target.value)}
                      className="flex-1 bg-gray-700/80 border-gray-600 text-gray-100 placeholder:text-gray-400 focus:border-slate-500 focus:ring-slate-500/20"
                      disabled={isConnected}
                      placeholder="Enter room identifier"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    You'll join other participants in this room
                  </p>
                </div>

                <Separator className="bg-gray-700/50" />

                <div className="grid grid-cols-2 gap-3">
                  {!localStream.current && (
                    <Button
                      onClick={handleStartStream}
                      className="col-span-2 gap-2 bg-gray-700/80 hover:bg-gray-600 text-gray-100 border border-gray-600 hover:border-gray-500 transition-all duration-200"
                      variant="outline"
                    >
                      <Icons.camera className="h-4 w-4" />
                      Start Camera
                    </Button>
                  )}

                  {!isConnected && (
                    <Button 
                      onClick={handleJoinRoom} 
                      className="col-span-2 gap-2 bg-gradient-to-r from-slate-600 to-gray-700 hover:from-slate-700 hover:to-gray-800 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      <Icons.logIn className="h-4 w-4" />
                      Join Stream
                    </Button>
                  )}

                  {isConnected && (
                    <Button 
                      onClick={handleLeaveRoom} 
                      variant="destructive" 
                      className="col-span-2 gap-2 bg-red-800/80 hover:bg-red-700/80 border border-red-700/50 hover:border-red-600/50 shadow-lg hover:shadow-xl transition-all duration-200"
                    >
                      <Icons.logOut className="h-4 w-4" />
                      Leave Stream
                    </Button>
                  )}

                  {localStream.current && (
                    <>
                      <Button
                        onClick={handleToggleMute}
                        variant={isMuted ? "secondary" : "outline"}
                        className={`gap-2 transition-all duration-200 ${
                          isMuted 
                            ? 'bg-red-600/80 hover:bg-red-500/80 text-red-100 border-red-600/50' 
                            : 'bg-gray-700/50 hover:bg-gray-600 text-gray-100 border-gray-600'
                        }`}
                      >
                        {isMuted ? <Icons.micOff className="h-4 w-4" /> : <Icons.mic className="h-4 w-4" />}
                        {isMuted ? "Unmute" : "Mute"}
                      </Button>

                      <Button
                        onClick={handleToggleVideo}
                        variant={isVideoOff ? "secondary" : "outline"}
                        className={`gap-2 transition-all duration-200 ${
                          isVideoOff 
                            ? 'bg-red-600/80 hover:bg-red-500/80 text-red-100 border-red-600/50' 
                            : 'bg-gray-700/50 hover:bg-gray-600 text-gray-100 border-gray-600'
                        }`}
                      >
                        <Icons.camera className="h-4 w-4" />
                        {isVideoOff ? "Show Video" : "Hide Video"}
                      </Button>
                    </>
                  )}
                </div>

                <Separator className="bg-gray-700/50" />

                <div className="space-y-3">
                  <Label className="text-gray-300">Room Code</Label>
                  <div className="flex items-center gap-2 p-3 bg-gray-700/50 rounded-lg border border-gray-600/50 hover:bg-gray-700/70 transition-colors duration-200">
                    <input 
                      value={roomCode} 
                      onChange={(e) => setRoomCode(e.target.value)} 
                      className="text-sm font-mono bg-transparent text-gray-100 border-none outline-none flex-1 tracking-wider" 
                      placeholder="Room code will appear here"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-gray-400 hover:text-gray-200 hover:bg-gray-600/50 transition-all duration-200"
                      onClick={() => navigator.clipboard.writeText(roomCode)}
                    >
                      <Icons.copy className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {pendingPeers.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-gray-300">Pending Requests</Label>
                      {pendingPeers.map(peerId => (
                        <div key={peerId} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg border border-gray-600/50 hover:bg-gray-700/70 transition-colors duration-200">
                          <span className="text-sm text-gray-200">Peer {peerId.substring(0, 6)}</span>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-green-800/50 hover:bg-green-700/60 text-green-200 border-green-700/50 hover:border-green-600/50 transition-all duration-200"
                              onClick={() => handlePeer('accept', peerId)}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="bg-red-800/50 hover:bg-red-700/60 text-red-200 border-red-700/50 hover:border-red-600/50 transition-all duration-200"
                              onClick={() => handlePeer('reject', peerId)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator className="bg-gray-700/50" />

                <div>
                  <h3 className="font-medium mb-3 text-gray-200">Connection Status</h3>
                  <div className="space-y-3 rounded-lg bg-gray-700/30 p-4 border border-gray-600/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Server Connection</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse shadow-sm shadow-green-500/50" : "bg-red-500"}`}></div>
                        <span className="text-xs font-medium text-gray-300">
                          {isConnected ? "Connected" : "Disconnected"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Room Status</span>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse shadow-sm shadow-green-500/50" : "bg-red-500"}`}></div>
                        <span className="text-xs font-medium text-gray-300">
                          {isConnected ? "Joined" : "Not in room"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Peers</span>
                      <span className="text-xs font-medium bg-slate-700/60 text-slate-300 px-2 py-1 rounded-full border border-slate-600/50 shadow-sm">
                        {peers.length} online
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div> */}