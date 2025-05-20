"use client"

import { useCallback, useEffect, useState } from "react"
import type { Socket } from "socket.io-client"
import { Device } from "mediasoup-client"
import * as mediasoupClient from "mediasoup-client"


type Transport = mediasoupClient.types.Transport
type Producer = mediasoupClient.types.Producer
type Consumer = mediasoupClient.types.Consumer

export function useMediasoup(socket: Socket | null) {
  const [device, setDevice] = useState<Device | null>(null)
  const [sendTransport, setSendTransport] = useState<Transport | null>(null)
  const [recvTransport, setRecvTransport] = useState<Transport | null>(null)
  const [producers, setProducers] = useState<Map<string, Producer>>(new Map())
  const [consumers, setConsumers] = useState<Map<string, Consumer>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [isJoined, setIsJoined] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)

  // Initialize device
  useEffect(() => {
    const initDevice = async () => {
      try {
        const newDevice = new Device()
        setDevice(newDevice)
      } catch (error) {
        console.error("Failed to create mediasoup Device:", error)
      }
    }

    initDevice()
  }, [])

  // Set up socket event listeners
  useEffect(() => {
    if (!socket || !device) return

    // Handle router RTP capabilities
    socket.on("router-rtp-capabilities", async (routerRtpCapabilities) => {
      try {
        await device.load({ routerRtpCapabilities })
        console.log("Device loaded with router capabilities")
      } catch (error) {
        console.error("Failed to load device:", error)
      }
    })

    // Handle transport creation
    socket.on("transport-created", async ({ id, iceParameters, iceCandidates, dtlsParameters, type }) => {
      try {
        if (type === "send") {
          const transport = device.createSendTransport({
            id,
            iceParameters,
            iceCandidates,
            dtlsParameters,
          })

          transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
            try {
              await socket.emit("transport-connect", {
                transportId: transport.id,
                dtlsParameters,
              })
              callback()
            } catch (error) {
              errback(error as Error)
            }
          })

          transport.on("produce", async ({ kind, rtpParameters, appData }, callback, errback) => {
            try {
              const { id } = await new Promise<{ id: string }>((resolve, reject) => {
                socket.emit(
                  "produce",
                  {
                    transportId: transport.id,
                    kind,
                    rtpParameters,
                    appData,
                  },
                  resolve,
                )
              })
              callback({ id })
            } catch (error) {
              errback(error as Error)
            }
          })

          setSendTransport(transport)
        } else if (type === "recv") {
          const transport = device.createRecvTransport({
            id,
            iceParameters,
            iceCandidates,
            dtlsParameters,
          })

          transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
            try {
              await socket.emit("transport-connect", {
                transportId: transport.id,
                dtlsParameters,
              })
              callback()
            } catch (error) {
              errback(error as Error)
            }
          })

          setRecvTransport(transport)
        }
      } catch (error) {
        console.error(`Failed to create ${type} transport:`, error)
      }
    })

    // Handle new producer
    socket.on("new-producer", async ({ producerId, peerId }) => {
      if (!recvTransport) return

      try {
        const { kind, rtpParameters } = await new Promise<{ kind: 'audio' | 'video'; rtpParameters: any }>((resolve) => {
          socket.emit(
            "consume",
            {
              transportId: recvTransport.id,
              producerId,
            },
            resolve,
          )
        })

        const consumer = await recvTransport.consume({
          id: producerId,
          producerId,
          kind,
          rtpParameters,
        })

        // Add to consumers map
        setConsumers((prev) => {
          const updated = new Map(prev)
          updated.set(producerId, consumer)
          return updated
        })

        // Create or update remote stream
        setRemoteStreams((prev) => {
          const updated = new Map(prev)
          let stream = updated.get(peerId)

          if (!stream) {
            stream = new MediaStream()
            updated.set(peerId, stream)
          }

          stream.addTrack(consumer.track)
          return updated
        })

        // Resume consumer
        socket.emit("consumer-resume", { consumerId: consumer.id })
      } catch (error) {
        console.error("Failed to consume producer:", error)
      }
    })

    // Handle producer closed
    socket.on("producer-closed", ({ producerId, peerId }) => {
      // Remove consumer
      const consumer = consumers.get(producerId)
      if (consumer) {
        consumer.close()
        setConsumers((prev) => {
          const updated = new Map(prev)
          updated.delete(producerId)
          return updated
        })
      }

      // Update remote stream
      setRemoteStreams((prev) => {
        const updated = new Map(prev)
        const stream = updated.get(peerId)

        if (stream) {
          // If this was the last track, remove the stream
          if (stream.getTracks().length <= 1) {
            updated.delete(peerId)
          }
        }

        return updated
      })
    })

    // Handle peer left
    socket.on("peer-left", ({ peerId }) => {
      // Remove all streams for this peer
      setRemoteStreams((prev) => {
        const updated = new Map(prev)
        updated.delete(peerId)
        return updated
      })
    })

    return () => {
      socket.off("router-rtp-capabilities")
      socket.off("transport-created")
      socket.off("new-producer")
      socket.off("producer-closed")
      socket.off("peer-left")
    }
  }, [socket, device, consumers, recvTransport])

  // Start local media stream
  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      setLocalStream(stream)
      return stream
    } catch (error) {
      console.error("Failed to get user media:", error)
      throw error
    }
  }, [])

  // Join room
  const joinRoom = useCallback(
    async (roomIdToJoin: string) => {
      if (!socket || !device || !localStream) {
        throw new Error("Socket, device, or local stream not ready")
      }

      try {
        // Request router capabilities
        socket.emit("get-router-capabilities")

        // Join room
        socket.emit("join-room", { roomId: roomIdToJoin })
        setRoomId(roomIdToJoin)

        // Request transports
        socket.emit("create-transport", { type: "send" })
        socket.emit("create-transport", { type: "recv" })

        // Wait for transports to be created
        await new Promise<void>((resolve) => {
          const checkTransports = () => {
            if (sendTransport && recvTransport) {
              resolve()
            } else {
              setTimeout(checkTransports, 100)
            }
          }
          checkTransports()
        })

        // Produce tracks
        if (sendTransport) {
          const videoTrack = localStream.getVideoTracks()[0]
          if (videoTrack) {
            const videoProducer = await sendTransport.produce({
              track: videoTrack,
              encodings: [{ maxBitrate: 100000 }, { maxBitrate: 300000 }, { maxBitrate: 900000 }],
              codecOptions: {
                videoGoogleStartBitrate: 1000,
              },
            })

            setProducers((prev) => {
              const updated = new Map(prev)
              updated.set("video", videoProducer)
              return updated
            })
          }

          const audioTrack = localStream.getAudioTracks()[0]
          if (audioTrack) {
            const audioProducer = await sendTransport.produce({
              track: audioTrack,
              codecOptions: {
                opusStereo: true,
                opusDtx: true,
              },
            })

            setProducers((prev) => {
              const updated = new Map(prev)
              updated.set("audio", audioProducer)
              return updated
            })
          }
        }

        setIsJoined(true)
      } catch (error) {
        console.error("Failed to join room:", error)
        throw error
      }
    },
    [socket, device, localStream, sendTransport, recvTransport],
  )

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!socket || !roomId) return

    try {
      // Close all producers
      producers.forEach((producer) => {
        producer.close()
      })
      setProducers(new Map())

      // Close all consumers
      consumers.forEach((consumer) => {
        consumer.close()
      })
      setConsumers(new Map())

      // Close transports
      if (sendTransport) {
        sendTransport.close()
        setSendTransport(null)
      }

      if (recvTransport) {
        recvTransport.close()
        setRecvTransport(null)
      }

      // Clear remote streams
      setRemoteStreams(new Map())

      // Leave room
      socket.emit("leave-room", { roomId })
      setRoomId(null)
      setIsJoined(false)
    } catch (error) {
      console.error("Failed to leave room:", error)
    }
  }, [socket, roomId, producers, consumers, sendTransport, recvTransport])

  return {
    localStream,
    remoteStreams,
    startLocalStream,
    joinRoom,
    leaveRoom,
    isJoined,
  }
}
