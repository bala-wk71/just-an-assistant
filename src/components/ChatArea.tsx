import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import MessageBubble from './MessageBubble'
import type { Database } from '../types/database'
import './ChatArea.css'

type Message = Database['public']['Tables']['messages']['Row']

interface Props {
  conversationId: string | null
  onConversationCreated: (id: string) => void
  onToggleSidebar: () => void
}

export default function ChatArea({ conversationId, onConversationCreated, onToggleSidebar }: Props) {
  const { user, session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    loadMessages(conversationId)
  }, [conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (data) setMessages(data)
  }

  const sendMessage = async () => {
    if (!input.trim() || sending || !user || !session) return

    const text = input.trim()
    setInput('')
    setSending(true)

    let convId = conversationId

    if (!convId) {
      const title = text.length > 50 ? text.slice(0, 50) + '...' : text
      const { data } = await supabase
        .from('conversations')
        .insert({ user_id: user.id, title })
        .select()
        .single()

      if (!data) {
        setSending(false)
        return
      }
      convId = data.id
      onConversationCreated(convId)
    } else {
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId)
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: convId,
      user_id: user.id,
      role: 'user',
      content: text,
      embedding: null,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      const response = await supabase.functions.invoke('chat', {
        body: { conversation_id: convId, message: text },
      })

      if (response.error) throw response.error

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        conversation_id: convId,
        user_id: user.id,
        role: 'assistant',
        content: response.data.response,
        embedding: null,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          conversation_id: convId!,
          user_id: user.id,
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          embedding: null,
          created_at: new Date().toISOString(),
        },
      ])
    }

    setSending(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="chat-area">
      <div className="chat-header">
        <button className="sidebar-toggle" onClick={onToggleSidebar}>☰</button>
        <span>{conversationId ? 'Chat' : 'New Chat'}</span>
      </div>

      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-chat">
            <h2>Just an Assistant</h2>
            <p>Send a message to start a conversation.</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {sending && (
          <div className="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={sending}
        />
        <button onClick={sendMessage} disabled={sending || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
