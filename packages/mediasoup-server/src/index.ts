import * as mediasoup from "mediasoup";
import { WebSocketServer } from "ws";

let worker: mediasoup.types.Worker;
let router: mediasoup.types.Router;
const peers = new Map<string, any>();

// Initialize mediasoup
async function initializeMediasoup() {
  worker = await mediasoup.createWorker();
  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {},
      },
    ],
  });
  console.log("Mediasoup Router created");
}

// Initialize WebSocket signaling server
function initializeWsServer() {
  const wss = new WebSocketServer({ port: 3002 });

  wss.on("connection", (ws) => {
    const id = crypto.randomUUID();
    peers.set(id, { ws });
    console.log(`Peer connected: ${id}`);

    ws.on("message", async (msg) => {
      const message = JSON.parse(msg.toString());
      const peer = peers.get(id);

      switch (message.action) {
        case "getRtpCapabilities":
          ws.send(
            JSON.stringify({ action: "rtpCapabilities", data: router.rtpCapabilities })
          );
          break;

        case "createTransport":
          // Use message.direction (must be "send" or "recv")
          const transport = await router.createWebRtcTransport({
            listenIps: [{ ip: "0.0.0.0", announcedIp: undefined }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
          });

          // Save transport by direction
          peer[message.direction + "Transport"] = transport;

          ws.send(
            JSON.stringify({
              action: "transportCreated",
              direction: message.direction,
              data: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
              },
            })
          );
          break;

        case "connectTransport":
          const transportToConnect = peer[message.direction + "Transport"];
          await transportToConnect.connect({ dtlsParameters: message.dtlsParameters });
          ws.send(JSON.stringify({ action: "transportConnected", direction: message.direction }));
          break;

        case "produce":
          const producer = await peer.sendTransport.produce({
            kind: message.kind,
            rtpParameters: message.rtpParameters,
          });
          peer.producer = producer;
          console.log("Producer created:", producer.id);

          ws.send(JSON.stringify({ action: "produced", data: { producerId: producer.id } }));

          // Notify other clients of new producer
          wss.clients.forEach((client: any) => {
            if (client !== ws && client.readyState === 1) {
              client.send(JSON.stringify({ action: "newProducer", data: { producerId: producer.id } }));
            }
          });
          break;

        case "consume":
          const consumer = await peer.recvTransport.consume({
            producerId: message.data.producerId,
            rtpCapabilities: message.data.rtpCapabilities,
            paused: false,
          });

          peer.consumer = consumer;

          ws.send(
            JSON.stringify({
              action: "consumed",
              data: {
                id: consumer.id,
                producerId: message.data.producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
              },
            })
          );
          break;

        default:
          console.warn("Unknown action:", message.action);
      }
    });

    ws.on("close", () => {
      console.log(`Peer disconnected: ${id}`);
      peers.delete(id);
    });
  });
}

async function main() {
  await initializeMediasoup();
  initializeWsServer();
}

main();
