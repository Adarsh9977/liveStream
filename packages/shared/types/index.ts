// Socket.IO event types
export interface JoinRoomPayload {
  roomId: string
}

export interface LeaveRoomPayload {
  roomId: string
}

export interface CreateTransportPayload {
  type: "send" | "recv"
  roomId: string
}

export interface TransportConnectPayload {
  transportId: string
  dtlsParameters: any
  roomId: string
}

export interface ProducePayload {
  transportId: string
  kind: "audio" | "video"
  rtpParameters: any
  appData: any
  roomId: string
}

export interface ConsumePayload {
  transportId: string
  producerId: string
  roomId: string
}

export interface ConsumerResumePayload {
  consumerId: string
  roomId: string
}

// Mediasoup types
export interface PeerInfo {
  id: string
}

export interface ProducerInfo {
  id: string
  kind: "audio" | "video"
  peerId: string
}

export interface ConsumerInfo {
  id: string
  producerId: string
  kind: "audio" | "video"
}

// HLS types
export interface HLSSegment {
  duration: number
  uri: string
}

export interface HLSPlaylist {
  segments: HLSSegment[]
  targetDuration: number
  version: number
  sequence: number
}
