import StreamRoom from "@/components/stream-room";


export default function StreamPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Live Stream Room</h1>
        <StreamRoom />
      </div>
    </div>
  )
}
