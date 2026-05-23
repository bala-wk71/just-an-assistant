import './MessageBubble.css'

interface Props {
  role: string
  content: string
}

export default function MessageBubble({ role, content }: Props) {
  return (
    <div className={`message-bubble ${role}`}>
      <div className="message-content">{content}</div>
    </div>
  )
}
