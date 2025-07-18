'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './chatbot.module.css';
import Image from 'next/image';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hey there! I\'m your **Exam Buddy**! I\'m here to help you ace your board exams. Ask me about past questions, key concepts, or anything else you need help with in your subjects!' }
  ]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: messages.filter(msg => msg.role !== 'system').concat(userMessage),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get response: ${response.status} ${errorText}`);
      }

      const rawData = await response.text();
      let messageContent: string;
      
      try {
        const jsonData = JSON.parse(rawData);
        if (jsonData.kwargs && jsonData.kwargs.content) {
          messageContent = jsonData.kwargs.content;
        } else if (jsonData.content) {
          messageContent = jsonData.content;
        } else if (typeof jsonData === 'string') {
          messageContent = jsonData;
        } else {
          messageContent = JSON.stringify(jsonData);
        }
      } catch {
        messageContent = rawData;
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: messageContent }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : String(error)}. Please try again later.` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.chatbotContainer}>
      <div className={styles.chatbotWindow}>
        {/* Header */}
        <div className={styles.chatHeader}>
          <div className={styles.headerContent}>
            <h3>
              <span className={styles.gradientText}>AI</span>{' '}
              <span className={styles.accentText}>Assistant</span>
            </h3>
            <p>I am here to help you ace your board exams </p>
          </div>
        </div>
          <div className={styles.messagesContainer}>
            {messages.filter(msg => msg.role !== 'system').map((message, index) => (
              <div 
                key={index} 
                className={`${styles.message} ${message.role === 'user' ? styles.userMessage : styles.assistantMessage}`}
              >
                {message.role === 'assistant' && (
                  <div className={styles.avatar}>
                    <Image 
                      src="/images/ChatBot.jpg" 
                      alt="Chat Bot" 
                      width={40} 
                      height={40} 
                      style={{ borderRadius: '50%', border: '2px solid #fff' }}
                    />
                  </div>
                )}
                <div className={styles.messageContent}>
                  <div className={styles.messageText}>
                    {message.content.split('\n').map((line, i) => (
                      <p key={i} style={{ margin: '0.5em 0' }}>
                        {line.includes('**') 
                          ? line.split('**').map((part, j) => 
                              j % 2 === 1 
                                ? <strong key={j}>{part}</strong> 
                                : <span key={j}>{part}</span>
                            )
                          : line
                        }
                      </p>
                    ))}
                  </div>
                  {message.role === 'assistant' && (
                    <div className={styles.messageTime}>
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className={`${styles.message} ${styles.assistantMessage}`}>
                <div className={styles.avatar}>
                  <Image 
                    src="/images/ChatBot.png" 
                    alt="Chat Bot" 
                    width={20} 
                    height={20} 
                  />
                </div>
                <div className={styles.messageContent}>
                  <div className={styles.loadingDots}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit} className={styles.inputForm}>
            <div className={styles.inputContainer}>
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message..."
                className={styles.chatInput}
                disabled={isLoading}
              />
              <button 
                type="submit" 
                className={styles.sendButton}
                disabled={isLoading || !input.trim()}
                aria-label="Send message"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}