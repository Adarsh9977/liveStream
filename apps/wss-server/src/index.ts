import { WebSocketServer, WebSocket } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import * as mediasoup from 'mediasoup'
import { WebRtcTransport } from 'mediasoup/node/lib/WebRtcTransportTypes'

interface Room {
  id: string
  adminId: string
  admin: WebSocket
  roomCode: string
  peers: Map<string, WebSocket>
  pendingPeers: Map<string, WebSocket>
  isLocked: boolean
  viewers: Map<string, WebSocket>
}

const wss = new WebSocketServer({ port: 3001 })
const rooms = new Map<string, Room>()

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', async (message: string) => {
    const data = JSON.parse(message)

    switch (data.type) {
      case 'join-room': {
        const { roomId, roomCode, isAdmin } = data

        // Check if room exists
        const existingRoom = rooms.get(roomId)
        if (isAdmin) {
          if (existingRoom) {
            // Room exists - check if it's locked
            if (existingRoom.isLocked) {
              ws.send(JSON.stringify({
                type: 'join-room-error',
                error: 'Room is locked by another admin'
              }))
              return
            }

            // Take over as admin
            existingRoom.admin = ws
            existingRoom.isLocked = true

            ws.send(JSON.stringify({
              type: 'room-created',
              roomId,
              success: true,
              roomCode,
              isAdmin: true
            }))
          } else {
            // Create new room
            const adminId = uuidv4()
            const room: Room = {
              id: roomId,
              adminId,
              admin: ws,
              roomCode,
              peers: new Map(),
              pendingPeers: new Map(),
              viewers: new Map(), 
              isLocked: true,
            }
            rooms.set(roomId, room)
            ws.send(JSON.stringify({
              type: 'room-created',
              roomId,
              adminId,
              success: true,
              isAdmin: true
            }))
          }
        } else {
          // Join existing room
          if (!existingRoom) {
            ws.send(JSON.stringify({
              type: 'join-room-error',
              error: 'Room not found'
            }))
            return
          }

          if (existingRoom.roomCode !== roomCode) {
            ws.send(JSON.stringify({
              type: 'join-room-error',
              error: 'Invalid room code'
            }))
            return
          }

          const peerId = uuidv4()
          existingRoom.pendingPeers.set(peerId, ws)

          // Notify admin of join request
          existingRoom.admin.send(JSON.stringify({
            type: 'participant-request',
            participantId: peerId
          }))
        }
        break
      }

      case 'lock-room': {
        const { roomId, adminId } = data
        const room = rooms.get(roomId)
        
        if (room && room.adminId === adminId) {
          room.isLocked = true
          room.admin = ws
          
          ws.send(JSON.stringify({
            type: 'room-locked',
            success: true
          }))
        }
        break
      }

      case 'unlock-room': {
        const { roomId, adminId } = data
        const room = rooms.get(roomId)
        
        if (room && room.adminId === adminId) {
          room.isLocked = false
          
          ws.send(JSON.stringify({
            type: 'room-unlocked',
            success: true
          }))
        }
        break
      }

      case 'accept-peer': {
        const { roomId, targetId } = data
        const room = rooms.get(roomId)

        if (room && room.pendingPeers.has(targetId)) {
          const peer = room.pendingPeers.get(targetId)!
          room.peers.set(targetId, peer)
          room.pendingPeers.delete(targetId)

          // Notify accepted peer
          peer.send(JSON.stringify({
            type: 'join-accepted',
            peerId: targetId,
            roomId
          }))

          // Notify all peers in room
          room.peers.forEach((peer, peerId) => {
            if (peerId !== targetId) {
              peer.send(JSON.stringify({
                type: 'participant-joined',
                participantId: targetId,
                roomId
              }))
            }
          })

          // Notify all viewers
          room.viewers.forEach(viewer => {
            viewer.send(JSON.stringify({
              type: 'peer-joined',
              roomId,
              peerId: targetId
            }))
          })

          ws.send(JSON.stringify({ type: 'accept-peer-success', participantId: targetId, roomId }));
        }
        break
      }

      case 'reject-peer': {
        const { roomId, targetId } = data
        const room = rooms.get(roomId)

        if (room && room.pendingPeers.has(targetId)) {
          const peer = room.pendingPeers.get(targetId)!
          room.pendingPeers.delete(targetId)

          peer.send(JSON.stringify({
            type: 'join-rejected'
          }))

          ws.send(JSON.stringify({ type: 'reject-peer-success', participantId: targetId }));
        }
        break
      }

      case 'offer': {
        const { roomId, targetId, offer, sourceId } = data
        const room = rooms.get(roomId)
        if (!room) break;

        let socketTo: WebSocket | undefined;
        if (targetId === room.adminId) {
          socketTo = room.admin;
        } else if (room.peers.has(targetId)) {
          socketTo = room.peers.get(targetId);
        } else if (room.viewers.has(targetId)) {
          socketTo = room.viewers.get(targetId);
        }

        if (socketTo) {
          socketTo.send(JSON.stringify({
            type: 'offer',
            offer,
            roomId,
            targetId,
            sourceId,
          }))
        }else {
          console.warn('Could not find socket for offer target:', targetId);
        }
        break
      }

      case 'answer': {
        const { roomId, targetId, sourceId, answer } = data
        const room = rooms.get(roomId)
        if (!room) break;

        let socketTo: WebSocket | undefined;
        if (targetId === room.adminId) {
          socketTo = room.admin;
        } else if (room.peers.has(targetId)) {
          socketTo = room.peers.get(targetId);
        } else if (room.viewers.has(targetId)) {
          socketTo = room.viewers.get(targetId);
        }

        if (socketTo) {
          socketTo.send(JSON.stringify({
            type: 'answer',
            answer,
            roomId,
            sourceId,
            targetId,
          }))
        }else {
          console.warn('Could not find socket for answer target:', targetId);
        }
        break
      }

      case 'ice-candidate': {
        const { roomId, targetId,sourceId, candidate } = data
        const room = rooms.get(roomId)
        if (!room) break;

        let socketTo: WebSocket | undefined;
        if (targetId === room.adminId) {
          socketTo = room.admin;
        } else if (room.peers.has(targetId)) {
          socketTo = room.peers.get(targetId);
        } else if (room.viewers.has(targetId)) {
          socketTo = room.viewers.get(targetId);
        }

        if (socketTo) {
          socketTo.send(JSON.stringify({
            type: 'ice-candidate',
            sourceId,
            targetId,
            candidate
          }));
        }else {
          console.warn('Could not find socket for ICE candidate target:', targetId);
        }
        break
      }

      case 'leave-room': {
        const { roomId, peerId } = data
        const room = rooms.get(roomId)

        if (room) {
          // If admin leaves, notify all peers and close room
          if (room.admin === ws) {
            room.peers.forEach(peer => {
              peer.send(JSON.stringify({
                type: 'room-closed',
                roomId
              }))
            })

            room.viewers.forEach(viewer => {
              viewer.send(JSON.stringify({
                type: 'room-closed',
                roomId
              }))
            })

            rooms.delete(roomId)
          } else {
            // Remove the leaving peer using provided peerId
            room.peers.delete(peerId)

            // Notify remaining peers
            room.peers.forEach(peer => {
              peer.send(JSON.stringify({
                type: 'participant-left',
                participantId: peerId,
                roomId
              }))
            })

            // Notify viewers
            room.viewers.forEach(viewer => {
              viewer.send(JSON.stringify({
                type: 'peer-left',
                peerId
              }))
            })
          }
        }
        break
      }

      case 'join-as-viewer': {
        const { roomId } = data
        const room = rooms.get(roomId)

        if (!room) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Room not found'
          }))
          return
        }
      
        const viewerId = uuidv4()
        room.viewers.set(viewerId, ws)
      
        // Send current room state to viewer
        ws.send(JSON.stringify({
          type: 'room-info',
          roomId,
          viewerId,
          peers: [room.adminId, ...Array.from(room.peers.keys())]
        }))

        break
      }

      case 'viewer-leave': {
        const { roomId, viewerId } = data
        const room = rooms.get(roomId)

        if (room) {
          room.viewers.delete(viewerId)
        }
        break
      }
    }
  })
})