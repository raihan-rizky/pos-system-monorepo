const fs = require('fs');
fetch('http://localhost:3000/api/default/chats?merge=true')
  .then(r => r.json())
  .then(allChats => {
    const chatId = '156500135780489@lid';
    const specificChat = allChats.find(c => c.id?._serialized === chatId);
    console.log('specificChat?', !!specificChat);
    if(specificChat) console.log('lastMessage?', !!specificChat.lastMessage);
    if(specificChat && specificChat.lastMessage) {
      const rawMessageData = specificChat.lastMessage._data || specificChat.lastMessage;
      console.log('mapped?', JSON.stringify([{
        ...specificChat.lastMessage,
        id: rawMessageData.id,
        from: rawMessageData.id?.remote || rawMessageData.from,
        fromMe: rawMessageData.id?.fromMe ?? rawMessageData.fromMe ?? false,
        body: rawMessageData.body || specificChat.lastMessage.body || '',
        timestamp: rawMessageData.t || specificChat.lastMessage.timestamp,
        hasMedia: (rawMessageData.type && rawMessageData.type !== 'chat') || specificChat.lastMessage.hasMedia
      }], null, 2));
    }
  });
