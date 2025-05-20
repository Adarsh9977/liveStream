"use client"

import { useEffect, useState, useRef } from "react"

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001')

    ws.onopen = () => {
      console.log("WebSocket connected")
      setIsConnected(true)
    }

    ws.onclose = () => {
      console.log("WebSocket disconnected")
      setIsConnected(false)
    }

    ws.onerror = (err) => {
      console.error("WebSocket error:", err)
    }

    ws.onmessage = (event) => {
      console.log("WebSocket message received:", event.data)
      // Handle message if needed
    }

    socketRef.current = ws

    return () => {
      ws.close()
    }
  }, [])

  return { socket: socketRef.current, isConnected }
}
