import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Database } from '../types/database'
import './ConversationList.css'

type Conversation = Database['public']['Tables']['conversations']['Row']

interface Props {
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onClose?: () => void
}

export default function ConversationList({ activeId, onSelect, onNew, onClose }: Props) {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])

  useEffect(() => {
    if (!user) return
    loadConversations()
  }, [user])

  const loadConversations = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false })

    if (data) setConversations(data)
  }

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await supabase.from('messages').delete().eq('conversation_id', id)
    await supabase.from('conversations').delete().eq('id', id)
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) onNew()
  }

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <h2>Chats</h2>
        <div className="header-buttons">
          <button className="new-chat-btn" onClick={onNew}>+ New</button>
          {onClose && <button className="close-sidebar-btn" onClick={onClose}>✕</button>}
        </div>
      </div>
      <div className="conversation-items">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`conversation-item ${activeId === conv.id ? 'active' : ''}`}
            onClick={() => onSelect(conv.id)}
          >
            <span className="conversation-title">{conv.title}</span>
            <button
              className="delete-btn"
              onClick={(e) => deleteConversation(conv.id, e)}
              title="Delete"
            >
              ×
            </button>
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="no-conversations">No conversations yet</p>
        )}
      </div>
    </div>
  )
}

export function useConversationRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)
  return { refreshKey, refresh: () => setRefreshKey((k) => k + 1) }
}
