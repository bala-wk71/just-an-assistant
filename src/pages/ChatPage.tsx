import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import ConversationList from '../components/ConversationList'
import ChatArea from '../components/ChatArea'
import './ChatPage.css'

export default function ChatPage() {
  const { signOut } = useAuth()
  const [activeConversation, setActiveConversation] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [listKey, setListKey] = useState(0)

  const handleNew = () => {
    setActiveConversation(null)
  }

  const handleConversationCreated = (id: string) => {
    setActiveConversation(id)
    setListKey((k) => k + 1)
  }

  return (
    <div className="chat-page">
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <ConversationList
          key={listKey}
          activeId={activeConversation}
          onSelect={setActiveConversation}
          onNew={handleNew}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="sidebar-footer">
          <button onClick={signOut} className="sign-out-btn">Sign Out</button>
        </div>
      </div>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <div className="chat-main">
        <ChatArea
          conversationId={activeConversation}
          onConversationCreated={handleConversationCreated}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>
    </div>
  )
}
