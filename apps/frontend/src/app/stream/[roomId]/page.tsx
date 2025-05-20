'use client'
import { Device } from "mediasoup-client";
import { useEffect, useRef } from "react";

export default function StreamPage() {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const deviceRef = useRef<Device>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const socketRef = useRef<WebSocket>(null);
  const localStreamRef = useRef<MediaStream>(null);

  useEffect(() => {
    const socket = new WebSocket("ws://localhost:3002");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("Connected to signaling server");
      socket.send(JSON.stringify({ action: "getRtpCapabilities" }));
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      const action = data.action;

      switch (action) {
        case "rtpCapabilities": {
          const device = new Device();
          await device.load({ routerRtpCapabilities: data.data });
          deviceRef.current = device;

          // Create send transport first
          socket.send(JSON.stringify({ action: "createTransport", direction: "send" }));
          break;
        }

        case "transportCreated": {
          const { id, iceParameters, iceCandidates, dtlsParameters } = data.data;

          if (data.direction === "send") {
            const sendTransport = deviceRef.current!.createSendTransport({
              id,
              iceParameters,
              iceCandidates,
              dtlsParameters,
              iceServers: [],
              proprietaryConstraints: {},
            });

            sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
              socket.send(JSON.stringify({ action: "connectTransport", dtlsParameters, transportId: sendTransport.id, direction: "send" }));
              callback();
            });

            sendTransport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
              socket.send(JSON.stringify({
                action: "produce",
                transportId: sendTransport.id,
                kind,
                rtpParameters
              }));

              // Wait for produced response
              const onProduced = (event: MessageEvent) => {
                const response = JSON.parse(event.data);
                if (response.action === "produced") {
                  callback({ id: response.data.producerId });
                  socket.removeEventListener("message", onProduced);
                }
              };
              socket.addEventListener("message", onProduced);
            });

            sendTransportRef.current = sendTransport;

            // Get local media and produce tracks
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            localStreamRef.current = stream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }

            for (const track of stream.getTracks()) {
              await sendTransport.produce({ track });
            }
          } else if (data.direction === "recv") {
            // Create receive transport
            const recvTransport = deviceRef.current!.createRecvTransport({
              id,
              iceParameters,
              iceCandidates,
              dtlsParameters,
              iceServers: [],
            });

            recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
              socket.send(JSON.stringify({ action: "connectTransport", dtlsParameters, transportId: recvTransport.id, direction: "recv" }));
              callback();
            });

            recvTransportRef.current = recvTransport;
          }
          break;
        }

        case "newProducer": {
          // When notified of new producer, create recv transport to consume
          socket.send(JSON.stringify({ action: "createTransport", direction: "recv" }));
          break;
        }

        case "transportConnected": {
          // Optionally handle transport connected event
          console.log(`${data.direction} transport connected`);
          break;
        }

        case "consumed": {
          // Backend sent consumer info, consume the media
          const { id, kind, rtpParameters, producerId } = data.data;
          const track = await recvTransportRef.current.consume({
            id,
            kind,
            rtpParameters,
            // Note: 'streamId' optional
          });

          const remoteStream = new MediaStream();
          remoteStream.addTrack(track);

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          break;
        }

        default:
          console.warn("Unknown action:", action);
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      <video ref={localVideoRef} autoPlay muted className="w-full rounded-xl border shadow-md" />
      <video ref={remoteVideoRef} autoPlay className="w-full rounded-xl border shadow-md" />
    </div>
  );
}
