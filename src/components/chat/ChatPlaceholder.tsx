import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, PhoneCall, Inbox, HelpCircle, MessageSquare } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';
import { Avatar } from '../common/Avatar';

type FriendsTab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

export const ChatPlaceholder: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FriendsTab>('online');
  const chats = useChatStore((s) => s.chats);
  const setActiveChat = useChatStore((s) => s.setActiveChat);

  const privateChats = chats.filter((c) => c.type !== 'channel');
  const onlineFriends = privateChats.filter((c) => c.online);

  return (
    <div className="flex flex-col w-full h-full select-none bg-[#313338] overflow-hidden">
      <div className="h-12 bg-[#313338] border-b border-[#1f2023] px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center min-w-0">
          <div className="flex items-center text-[#80848e] mr-2 shrink-0">
            <Users size={22} />
          </div>
          <span className="font-bold text-white text-[15px] mr-4 whitespace-nowrap">
            {t('discord.friends', 'Друзья')}
          </span>
          <div className="w-[1px] h-4 bg-[#3f4147] mr-4 shrink-0" />

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('online')}
              className={`px-2 py-1 rounded text-[14px] font-medium transition-colors cursor-pointer border-none outline-none whitespace-nowrap ${
                activeTab === 'online'
                  ? 'bg-[#404249] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1] bg-transparent'
              }`}
            >
              {t('discord.online', 'В сети')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2 py-1 rounded text-[14px] font-medium transition-colors cursor-pointer border-none outline-none whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-[#404249] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1] bg-transparent'
              }`}
            >
              {t('discord.all', 'Все')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-2 py-1 rounded text-[14px] font-medium transition-colors cursor-pointer border-none outline-none whitespace-nowrap ${
                activeTab === 'pending'
                  ? 'bg-[#404249] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1] bg-transparent'
              }`}
            >
              {t('discord.pending', 'В ожидании')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('blocked')}
              className={`px-2 py-1 rounded text-[14px] font-medium transition-colors cursor-pointer border-none outline-none whitespace-nowrap ${
                activeTab === 'blocked'
                  ? 'bg-[#404249] text-white'
                  : 'text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1] bg-transparent'
              }`}
            >
              {t('discord.blocked', 'Заблокированные')}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('add')}
              className="bg-[#5865F2] hover:bg-[#4752c4] text-white text-[13px] font-medium px-2.5 py-1 rounded transition-colors cursor-pointer border-none outline-none ml-2 whitespace-nowrap"
            >
              {t('discord.addFriend', 'Добавить в друзья')}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[#b5bac1] shrink-0 ml-4">
          <button
            type="button"
            aria-label={t('discord.startGroupCall', 'Начать голосовой звонок')}
            className="p-1.5 rounded hover:bg-[#35373c] hover:text-white transition-colors bg-transparent border-none outline-none cursor-pointer"
          >
            <PhoneCall size={20} />
          </button>
          <button
            type="button"
            aria-label={t('discord.inbox', 'Почта')}
            className="p-1.5 rounded hover:bg-[#35373c] hover:text-white transition-colors bg-transparent border-none outline-none cursor-pointer"
          >
            <Inbox size={20} />
          </button>
          <button
            type="button"
            aria-label={t('discord.help', 'Справка')}
            className="p-1.5 rounded hover:bg-[#35373c] hover:text-white transition-colors bg-transparent border-none outline-none cursor-pointer"
          >
            <HelpCircle size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {activeTab === 'online' && (
            onlineFriends.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <span className="text-[#949ba4] text-[15px]">
                  {t('discord.noFriendsOnline', 'Сейчас никого из ваших друзей нет в сети. Зайдите позже!')}
                </span>
              </div>
            ) : (
              <div className="p-4 flex flex-col space-y-1">
                <div className="text-[12px] font-bold text-[#949ba4] uppercase tracking-wider px-2 py-1 mb-1">
                  {t('discord.online', 'В сети')} — {onlineFriends.length}
                </div>
                {onlineFriends.map((friend) => (
                  <div
                    key={friend.id}
                    onClick={() => setActiveChat(friend.id)}
                    className="flex items-center justify-between p-2 rounded hover:bg-[#35373c] cursor-pointer group transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <Avatar src={friend.avatarUrl} alt={friend.name} className="w-10 h-10 rounded-full" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#23a55a] border-2 border-[#313338]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-white text-[15px] truncate">
                          {friend.name}
                        </span>
                        <span className="text-xs text-[#949ba4] truncate">
                          {t('discord.online', 'В сети')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveChat(friend.id);
                        }}
                        aria-label={friend.name}
                        className="w-9 h-9 rounded-full bg-[#2b2d31] hover:bg-[#1e1f22] text-[#b5bac1] hover:text-white flex items-center justify-center transition-colors border-none outline-none cursor-pointer"
                      >
                        <MessageSquare size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'all' && (
            <div className="p-4 flex flex-col space-y-1">
              <div className="text-[12px] font-bold text-[#949ba4] uppercase tracking-wider px-2 py-1 mb-1">
                {t('discord.all', 'Все')} — {privateChats.length}
              </div>
              {privateChats.map((friend) => (
                <div
                  key={friend.id}
                  onClick={() => setActiveChat(friend.id)}
                  className="flex items-center justify-between p-2 rounded hover:bg-[#35373c] cursor-pointer group transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <Avatar src={friend.avatarUrl} alt={friend.name} className="w-10 h-10 rounded-full" />
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#313338] ${
                          friend.online ? 'bg-[#23a55a]' : 'bg-[#80848e]'
                        }`}
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-white text-[15px] truncate">
                        {friend.name}
                      </span>
                      <span className="text-xs text-[#949ba4] truncate">
                        {friend.online ? t('discord.online', 'В сети') : t('common.offline', 'Не в сети')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveChat(friend.id);
                      }}
                      aria-label={friend.name}
                      className="w-9 h-9 rounded-full bg-[#2b2d31] hover:bg-[#1e1f22] text-[#b5bac1] hover:text-white flex items-center justify-center transition-colors border-none outline-none cursor-pointer"
                    >
                      <MessageSquare size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-[#949ba4] text-[15px]">
              {t('discord.quietForNow', 'Пока что тут тихо...')}
            </div>
          )}

          {activeTab === 'blocked' && (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-[#949ba4] text-[15px]">
              {t('discord.quietForNow', 'Пока что тут тихо...')}
            </div>
          )}

          {activeTab === 'add' && (
            <div className="p-6 flex flex-col max-w-[500px]">
              <h2 className="text-white text-base font-bold uppercase tracking-wide mb-2">
                {t('discord.addFriend', 'Добавить в друзья')}
              </h2>
              <p className="text-[#949ba4] text-xs mb-4">
                {t('connectModal.searchPlaceholder', 'Введите имя пользователя или код')}
              </p>
              <div className="flex items-center bg-[#1e1f22] rounded-lg p-3 border border-[#1f2023] focus-within:border-[#5865F2]">
                <input
                  type="text"
                  placeholder={t('connectModal.usernameOrCode', 'Username или UUID')}
                  className="bg-transparent border-none outline-none text-white text-sm flex-1 placeholder-[#949ba4]"
                />
                <button
                  type="button"
                  className="bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-semibold px-4 py-2 rounded transition-colors border-none cursor-pointer"
                >
                  {t('connectModal.connect', 'Отправить запрос')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-[360px] border-l border-[rgba(255,255,255,0.04)] bg-[#313338] p-4 flex flex-col shrink-0 select-none hidden lg:flex">
          <h2 className="text-[20px] font-bold text-white mb-4">
            {t('discord.activeContacts', 'Активные контакты')}
          </h2>
          <div className="bg-[#2b2d31] rounded-lg p-4 text-center border border-[rgba(255,255,255,0.03)] shadow-sm">
            <h3 className="font-bold text-white text-[15px] mb-2">
              {t('discord.quietForNow', 'Пока что тут тихо...')}
            </h3>
            <p className="text-xs text-[#949ba4] leading-relaxed m-0">
              {t('discord.quietForNowDesc', 'Если ваш друг начнет чем-то заниматься — например, запустит игру или войдет в голосовой чат, — вы увидите это здесь!')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
