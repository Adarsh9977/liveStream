import RoomViewer from "@/components/room-viewer"

export default function WatchPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold mb-6">Watch Live Streams</h1>
        <RoomViewer />
      </div>
    </div>
  )
}