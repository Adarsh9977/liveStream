'use client'
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export default function RoomViewer() {
    const params = useParams()
    const ws = useRef<WebSocket | null>(null)
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
    const remoteStreams = useRef<Map<string, MediaStream>>(new Map())
    const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
    const [peers, setPeers] = useState<string[]>([])
    const [roomId, setRoomId] = useState<string>(params.roomId as string)
    const viewerId = useRef<string | null>(null)

useEffect(() => {
    ws.current = new WebSocket("ws://localhost:3001")

    ws.current.onmessage = async (event) => {
    const message = JSON.parse(event.data)
    switch (message.type) {
        case "room-info": {
            const { roomId, peers, viewerId: newViewerId } = message
            setRoomId(roomId)
            setPeers(peers)
            viewerId.current = newViewerId;
            // Request to connect to each peer
            peers.forEach((peerId: string) => {
                handleConnectToPeer(peerId, roomId)
            })
            break
        }
        case "offer": {
            const { sourceId, offer } = message
            break
        }
        case "ice-candidate": {
            const { sourceId, candidate } = message
            await handleIceCandidate(sourceId, candidate)
            break
        }
        case "peer-joined": {
            const { peerId, roomId } = message
            setPeers(prev => [...prev, peerId])
            handleConnectToPeer(peerId, roomId)
            break
        }
        case "peer-left": {
            const { peerId } = message
            handlePeerLeft(peerId)
            break
        }
    }
    }

    // Join as viewer
    ws.current.onopen = () => {
    ws.current?.send(JSON.stringify({
        type: "join-as-viewer",
        roomId
    }))
    }

    return () => {
    if(ws.current && viewerId.current) {
        ws.current.send(JSON.stringify({
        type: "viewer-leave",
        roomId,
        viewerId: viewerId.current
        }))
        ws.current.close()
    }
    cleanupConnections()
    }
}, [])

const handleConnectToPeer = async (peerId: string, roomId: string) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  
    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      remoteStreams.current.set(peerId, stream);
      const videoElement = remoteVideoRefs.current.get(peerId);
      if (videoElement) {
        videoElement.srcObject = stream;
      }
    };
  
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        ws.current?.send(
          JSON.stringify({
            type: "ice-candidate",
            targetId: peerId,
            sourceId: viewerId.current, // This is me (the viewer)
            roomId,
            candidate: event.candidate,
          })
        );
      }
    };
  
    peerConnections.current.set(peerId, peerConnection);
  
    // ✅ Create an offer as a viewer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
  
    // ✅ Send offer to the peer who’s already in the room
    ws.current?.send(
      JSON.stringify({
        type: "offer",
        targetId: peerId,
        sourceId: viewerId.current, // This is me (the viewer)
        roomId,
        offer,
      })
    );
  };
  

const handleIceCandidate = async (sourceId: string, candidate: RTCIceCandidateInit) => {
    const peerConnection = peerConnections.current.get(sourceId)
    if (peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    }
}

const handlePeerLeft = (peerId: string) => {
    const peerConnection = peerConnections.current.get(peerId)
    if (peerConnection) {
    peerConnection.close()
    peerConnections.current.delete(peerId)
    }
    remoteStreams.current.delete(peerId)
    remoteVideoRefs.current.delete(peerId)
    setPeers(prev => prev.filter(id => id !== peerId))
}

const cleanupConnections = () => {
    peerConnections.current.forEach(pc => pc.close())
    peerConnections.current.clear()
    remoteStreams.current.clear()
    remoteVideoRefs.current.clear()
    if (ws.current) {
    ws.current.close()
    ws.current = null
    }
}

return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    {peers.map(peerId => (
        <div key={peerId} className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <video
            ref={el => {
            if (el) {
                remoteVideoRefs.current.set(peerId, el)
                const stream = remoteStreams.current.get(peerId)
                if (stream) {
                    el.srcObject = stream
                }
            }
            }}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
        />
        <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-sm text-white">
            Peer {peerId.slice(0, 8)}
        </div>
        </div>
    ))}
    </div>
)
}